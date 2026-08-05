/**
 * systemctl.js — Unica capa que habla con systemd. Nada fuera de este archivo
 * ejecuta procesos del sistema.
 *
 * ============================ NOTA ACADEMICA ============================
 * El proceso de Node corre DENTRO de un contenedor Docker, es decir, dentro
 * de un conjunto de namespaces del kernel (PID, mount, network, IPC, UTS).
 * Por eso `ps` dentro del contenedor solo ve sus propios procesos y no los
 * del host: el namespace PID le da su propia numeracion empezando en 1.
 *
 * Entonces, como controla los servicios del ANFITRION?
 * No hablamos con systemd "por procesos", sino por su API de D-Bus. systemd
 * (PID 1 del host) expone su gestor en el socket UNIX del bus del sistema
 * (/var/run/dbus/system_bus_socket) y en /run/systemd. Al montar esos sockets
 * dentro del contenedor (bind mount), el namespace de MONTAJE del contenedor
 * incluye esos archivos especiales del host: el binario cliente `systemctl`
 * que instalamos en la imagen se conecta a ellos y sus ordenes las ejecuta
 * el systemd del host, no uno interno (el contenedor NO corre systemd: su
 * PID 1 es Node).
 *
 * Es decir: el aislamiento sigue intacto salvo por el "agujero" concreto y
 * controlado que abrimos — los dos sockets. Es exactamente la misma idea que
 * montar /var/run/docker.sock para controlar Docker desde un contenedor.
 * =======================================================================
 *
 * SEGURIDAD: se usa SIEMPRE execFile con un ARRAY de argumentos. execFile no
 * lanza un shell, asi que metacaracteres como ; | & $() ` quedan como texto
 * literal y la inyeccion de comandos es imposible por construccion. Usar
 * exec() (que si abre /bin/sh) seria la vulnerabilidad clasica de este tipo
 * de paneles. Ademas no se usa `sudo`: el proceso ya es root dentro del
 * contenedor y polkit del host autoriza al usuario root del bus.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { listManagedServiceNames } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

const execFileAsync = promisify(execFile);

// Propiedades que pedimos a systemd de una sola vez (una unica llamada D-Bus).
// LoadState se incluye para distinguir "unidad inexistente" (not-found) de
// "unidad existente pero parada", que systemd reporta ambas como inactive.
const SHOW_PROPERTIES = [
  'LoadState',
  'ActiveState',
  'SubState',
  'MainPID',
  'ExecMainStartTimestamp',
  'MemoryCurrent',
  'Description',
  // --- Metricas de recursos (una sola llamada D-Bus para todas) ---
  // CPUUsageNSec: tiempo de CPU ACUMULADO del cgroup del servicio, en
  // nanosegundos, desde que arranco. No es un porcentaje: para obtener el
  // %CPU instantaneo hay que derivarlo entre dos muestras (ver cpuSamples).
  'CPUUsageNSec',
  // TasksCurrent: numero de tareas (procesos + hilos) del cgroup. Es el
  // pids.current del controlador cgroup v2.
  'TasksCurrent',
  'TasksMax',
  // NRestarts: cuantas veces systemd ha reiniciado la unidad por su politica
  // Restart=. Un numero que sube solo delata un servicio inestable.
  'NRestarts',
  // UnitFileState: enabled / disabled / static / masked -> si arranca en boot.
  'UnitFileState',
].join(',');

// Metadatos adicionales que solo se consultan al abrir el acordeon de un
// servicio. Se mantienen fuera del sondeo de 5 s para que la tabla principal
// siga siendo ligera.
const DETAIL_PROPERTIES = [
  'UnitFileState',
  'FragmentPath',
  'Type',
  'Restart',
  'ExecStart',
].join(',');

const VALID_STATES = ['active', 'inactive', 'failed', 'activating', 'deactivating'];

// systemd devuelve este centinela (UINT64_MAX) cuando la propiedad no aplica.
const UINT64_MAX = '18446744073709551615';

/**
 * Ejecuta systemctl con timeout duro. Si la unidad esta colgada o el bus no
 * responde, el proceso hijo se mata a los 10s y no se filtra un worker.
 */
async function runSystemctl(args) {
  return execFileAsync('systemctl', args, {
    timeout: config.execTimeoutMs,
    // Suficiente para la salida de `show`; evita consumir memoria sin limite.
    maxBuffer: 1024 * 1024,
    // LANG=C fuerza salida en ingles y formato de fecha estable, sin importar
    // la configuracion regional del host.
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
  });
}

/** Convierte la salida `clave=valor` de `systemctl show` en un objeto. */
function parseShowOutput(stdout) {
  const props = {};
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    props[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return props;
}

/**
 * Interpreta el timestamp de systemd, p. ej. "Mon 2026-08-04 14:30:00 UTC".
 * El contenedor corre en UTC (la imagen slim no fija zona horaria), asi que
 * la salida viene en UTC; aun asi se soporta un desplazamiento numerico
 * (+HH:MM / -HHMM) por si el host inyecta TZ en el entorno.
 * @returns {number|null} milisegundos desde epoch, o null si no aplica.
 */
function parseSystemdTimestamp(raw) {
  if (!raw || raw === 'n/a' || raw === '0') return null;

  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;

  const [, y, mo, d, h, mi, s] = m.map(Number);
  let ms = Date.UTC(y, mo - 1, d, h, mi, s);

  // Acepta "-04", "-0400" y "+05:30" al final de la cadena.
  const offset = raw.match(/([+-])(\d{2}):?(\d{2})?\s*$/);
  if (offset) {
    const sign = offset[1] === '-' ? -1 : 1;
    const offsetMs = sign * (Number(offset[2]) * 60 + Number(offset[3] || 0)) * 60_000;
    ms -= offsetMs; // la hora local mostrada se lleva a UTC real
  }
  return ms;
}

/**
 * Entero sin signo de systemd -> numero o null.
 * systemd usa "[not set]" o UINT64_MAX como centinelas de "no aplica"; sirve
 * igual para MemoryCurrent, CPUUsageNSec, TasksCurrent y NRestarts.
 */
function parseUint(raw) {
  if (!raw || raw === '[not set]' || raw === 'infinity' || raw === UINT64_MAX) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** MainPID -> numero o null (systemd usa 0 cuando no hay proceso principal). */
function parsePid(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* -------------------------------------------------------------------- */
/*  Calculo del %CPU a partir de dos muestras                            */
/* -------------------------------------------------------------------- */
/**
 * systemd NO expone un "porcentaje de CPU": expone CPUUsageNSec, un contador
 * ACUMULADO de nanosegundos de CPU consumidos por el cgroup del servicio
 * desde que arranco. Es exactamente el mismo modelo que /proc/<pid>/stat.
 *
 * El porcentaje es una DERIVADA: hay que medir cuanto subio ese contador
 * entre dos instantes y dividirlo por el tiempo real transcurrido.
 *
 *     %CPU = (ΔtiempoDeCPU / ΔtiempoDeReloj) × 100
 *
 * Por eso guardamos la muestra anterior de cada servicio en memoria. Es la
 * misma tecnica que usan `top`, `htop` y `systemd-cgtop`, y explica por que
 * el primer sondeo tras abrir el panel muestra "—": todavia no hay con que
 * comparar. A partir del segundo (5 s despues) ya aparece el valor.
 *
 * El resultado es porcentaje de UN nucleo, como en `top`: un servicio que
 * satura 2 nucleos reporta 200 %. El frontend recibe tambien el numero de
 * nucleos del host para poder mostrarlo en proporcion a la capacidad total.
 */
const cpuSamples = new Map(); // nombre -> { cpuNSec, sampledAt, pid, percent }

// Por debajo de este intervalo el ruido de medicion domina el resultado
// (dos refrescos manuales seguidos darian cifras absurdas), asi que se
// reutiliza el ultimo porcentaje calculado en lugar de recalcular.
const MIN_SAMPLE_INTERVAL_MS = 750;

function computeCpuPercent(name, cpuNSec, pid) {
  if (cpuNSec === null) {
    cpuSamples.delete(name);
    return null;
  }

  const now = Date.now();
  const prev = cpuSamples.get(name);

  // Sin muestra previa, o el servicio se reinicio (cambio de PID, o el
  // contador retrocedio porque systemd lo puso a cero): hay que empezar de
  // nuevo la linea base. Devolver un porcentaje aqui seria inventarselo.
  if (!prev || prev.pid !== pid || cpuNSec < prev.cpuNSec) {
    cpuSamples.set(name, { cpuNSec, sampledAt: now, pid, percent: null });
    return null;
  }

  const elapsedMs = now - prev.sampledAt;
  if (elapsedMs < MIN_SAMPLE_INTERVAL_MS) return prev.percent;

  const deltaCpuNs = cpuNSec - prev.cpuNSec;
  const elapsedNs = elapsedMs * 1e6;
  // Un decimal: mas precision seria ruido, no informacion.
  const percent = Math.round((deltaCpuNs / elapsedNs) * 1000) / 10;

  cpuSamples.set(name, { cpuNSec, sampledAt: now, pid, percent });
  return percent;
}

/** Descarta las muestras de servicios que ya no se administran. */
function pruneCpuSamples(currentNames) {
  const keep = new Set(currentNames);
  for (const name of cpuSamples.keys()) {
    if (!keep.has(name)) cpuSamples.delete(name);
  }
}

/**
 * Estado completo de un servicio del host.
 * @returns {Promise<ServiceStatus>} objeto del contrato publico de la API.
 */
export async function getServiceStatus(name) {
  let props;
  try {
    const { stdout } = await runSystemctl([
      'show',
      name,
      `--property=${SHOW_PROPERTIES}`,
      '--no-pager',
    ]);
    props = parseShowOutput(stdout);
  } catch (err) {
    // `show` no suele fallar ni con unidades inexistentes; si falla es que el
    // bus no esta disponible (sockets no montados, permisos, systemd caido).
    // Se devuelve un estado "unknown" en lugar de propagar el error para que
    // un servicio problematico no tumbe todo el listado del panel.
    console.error(`[systemctl] show ${name} fallo:`, (err.stderr || err.message || '').trim());
    cpuSamples.delete(name);
    return {
      name,
      description: null,
      loadState: null,
      status: 'unknown',
      subState: null,
      pid: null,
      uptimeSeconds: null,
      memoryBytes: null,
      cpuPercent: null,
      cpuSeconds: null,
      tasks: null,
      tasksMax: null,
      restarts: null,
      unitFileState: null,
    };
  }

  // Unidad que no existe en el host (no instalada / mal escrita).
  const notFound = props.LoadState === 'not-found' || props.LoadState === 'masked';

  const activeState = props.ActiveState || '';
  const status = notFound
    ? 'unknown'
    : VALID_STATES.includes(activeState)
      ? activeState
      : 'unknown';

  // El uptime solo tiene sentido mientras el servicio esta corriendo.
  let uptimeSeconds = null;
  if (status === 'active') {
    const startMs = parseSystemdTimestamp(props.ExecMainStartTimestamp);
    if (startMs !== null) {
      uptimeSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    }
  }

  const pid = notFound ? null : parsePid(props.MainPID);

  // El contador de CPU solo tiene sentido mientras la unidad esta cargada y
  // corriendo; si esta parada, systemd conserva el acumulado del ultimo
  // arranque y calcular una derivada sobre el daria siempre 0 %.
  const cpuNSec = notFound ? null : parseUint(props.CPUUsageNSec);
  const cpuPercent =
    status === 'active' ? computeCpuPercent(name, cpuNSec, pid) : null;
  if (status !== 'active') cpuSamples.delete(name);

  return {
    name,
    description: props.Description || null,
    // Se expone para que el frontend distinga una unidad inexistente de un
    // fallo al consultar el bus (ambos usan status="unknown").
    loadState: props.LoadState || null,
    status,
    subState: notFound ? null : props.SubState || null,
    pid,
    uptimeSeconds,
    memoryBytes: notFound ? null : parseUint(props.MemoryCurrent),
    // --- Metricas de recursos ---
    /** % de UN nucleo, como `top`. null hasta tener dos muestras. */
    cpuPercent,
    /** Tiempo de CPU acumulado en segundos desde que arranco el servicio. */
    cpuSeconds: cpuNSec === null ? null : Math.round(cpuNSec / 1e9),
    /** Procesos + hilos del cgroup (pids.current de cgroup v2). */
    tasks: notFound ? null : parseUint(props.TasksCurrent),
    /** Limite de tareas del cgroup, si systemd tiene uno configurado. */
    tasksMax: notFound ? null : parseUint(props.TasksMax),
    /** Reinicios automaticos hechos por la politica Restart= de la unidad. */
    restarts: notFound ? null : parseUint(props.NRestarts),
    /** enabled | disabled | static | masked -> si arranca solo en cada boot. */
    unitFileState: props.UnitFileState || null,
  };
}

/**
 * Estado de todos los servicios de la lista blanca.
 * Se consultan en PARALELO con Promise.all: son llamadas de E/S independientes
 * y hacerlas en serie multiplicaria la latencia por el numero de servicios.
 * getServiceStatus nunca rechaza (captura sus errores), asi que Promise.all
 * no puede fallar por un servicio suelto.
 */
export async function listServices() {
  const names = listManagedServiceNames();
  // Evita que la cache de muestras de CPU retenga servicios ya quitados.
  pruneCpuSamples(names);
  return Promise.all(names.map((name) => getServiceStatus(name)));
}

/**
 * Estado y metadatos tecnicos de una unidad para el acordeon de detalles.
 * La salida sigue siendo una lista fija de propiedades: nunca se acepta un
 * argumento systemctl enviado libremente por el navegador.
 */
export async function getServiceDetails(name) {
  const service = await getServiceStatus(name);

  try {
    const { stdout } = await runSystemctl([
      'show',
      name,
      `--property=${DETAIL_PROPERTIES}`,
      '--no-pager',
    ]);
    const props = parseShowOutput(stdout);

    return {
      service,
      metadata: {
        unitFileState: props.UnitFileState || null,
        unitPath: props.FragmentPath || null,
        serviceType: props.Type || null,
        restartPolicy: props.Restart || null,
        execStart: props.ExecStart || null,
      },
    };
  } catch (err) {
    console.error(
      `[systemctl] detalles de ${name} fallaron:`,
      (err.stderr || err.message || '').trim()
    );
    return {
      service,
      metadata: {
        unitFileState: null,
        unitPath: null,
        serviceType: null,
        restartPolicy: null,
        execStart: null,
      },
    };
  }
}

/**
 * Ejecuta start | stop | restart y devuelve el estado RESULTANTE.
 * @throws {AppError} 500 SYSTEMCTL_ERROR con el stderr real de systemctl.
 */
export async function controlService(name, action) {
  try {
    // systemctl bloquea hasta que el "job" de systemd termina, por lo que al
    // volver de aqui la transicion de estado ya se ejecuto.
    await runSystemctl([action, name]);
  } catch (err) {
    const stderr = (err.stderr || '').trim();
    const detail =
      err.killed || err.signal === 'SIGTERM'
        ? `La operacion "${action}" sobre "${name}" excedio el tiempo limite de ${config.execTimeoutMs / 1000}s.`
        : stderr || err.message || 'systemctl fallo sin mensaje de error.';

    throw new AppError(500, 'SYSTEMCTL_ERROR', detail);
  }

  // Pequena espera antes de releer: systemd ya termino el job, pero el
  // SubState (p. ej. running <- start-post) puede tardar unos ms en asentarse.
  await new Promise((resolve) => setTimeout(resolve, 250));

  return getServiceStatus(name);
}
