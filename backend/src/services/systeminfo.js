/**
 * systeminfo.js — Metricas globales de la maquina anfitriona.
 *
 * ============================ NOTA ACADEMICA ============================
 * Este modulo NO ejecuta ningun comando: lee el modulo `os` de Node, que a
 * su vez lee /proc del kernel. Y aqui hay un detalle que vale oro para la
 * defensa:
 *
 *   Un contenedor Docker comparte el KERNEL del host. Los namespaces le dan
 *   su propia vista de procesos, red y sistema de archivos, PERO /proc/stat,
 *   /proc/loadavg y /proc/meminfo NO estan aislados por ningun namespace.
 *   Por eso, desde dentro del contenedor, os.loadavg(), os.totalmem() y
 *   os.cpus() devuelven los valores del HOST, no los del contenedor.
 *
 * Es la demostracion mas directa de que un contenedor no es una maquina
 * virtual: una VM tendria su propio kernel y su propia memoria; aqui el
 * kernel es literalmente el mismo, y os.release() lo prueba porque devuelve
 * la version del kernel del anfitrion.
 *
 * (Los cgroups SI pueden limitar cuanta CPU y memoria consume realmente el
 * contenedor, pero eso es contabilidad y limites, no aislamiento de la
 * lectura: el contenedor sigue "viendo" el total de la maquina.)
 * =======================================================================
 */
import os from 'node:os';

/**
 * Reparte el tiempo de CPU acumulado que reporta el kernel para calcular el
 * uso instantaneo. Igual que con los servicios, %CPU es una DERIVADA: hay
 * que comparar dos lecturas de /proc/stat separadas en el tiempo.
 */
let prevCpuTimes = null;

function totalCpuTimes() {
  // os.cpus() devuelve, por nucleo, los tics acumulados en cada modo:
  // user (procesos de usuario), nice, sys (kernel), idle (inactivo), irq.
  let idle = 0;
  let total = 0;

  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/**
 * %CPU del host = 100 - (Δidle / Δtotal) × 100.
 * Devuelve null en la primera lectura, cuando aun no hay con que comparar.
 */
function computeHostCpuPercent() {
  const current = totalCpuTimes();
  const prev = prevCpuTimes;
  prevCpuTimes = current;

  if (!prev) return null;

  const deltaTotal = current.total - prev.total;
  const deltaIdle = current.idle - prev.idle;
  // Contadores reiniciados o dos lecturas en el mismo tic: no hay dato fiable.
  if (deltaTotal <= 0) return null;

  const percent = (1 - deltaIdle / deltaTotal) * 100;
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

/**
 * Instantanea del anfitrion para la fila de indicadores del panel.
 * @returns {object} contrato publico de GET /api/system
 */
export function getSystemInfo() {
  const cores = os.cpus().length;
  const memoryTotal = os.totalmem();
  const memoryFree = os.freemem();

  // La carga media (load average) NO es un porcentaje: es el numero medio de
  // procesos en estado ejecutable o en espera de E/S ininterrumpible durante
  // 1, 5 y 15 minutos. Una carga igual al numero de nucleos significa el
  // sistema justo saturado; por encima, hay procesos haciendo cola.
  const [load1, load5, load15] = os.loadavg();

  return {
    // --- CPU ---
    cpuCores: cores,
    cpuPercent: computeHostCpuPercent(),
    loadAverage: {
      one: Math.round(load1 * 100) / 100,
      five: Math.round(load5 * 100) / 100,
      fifteen: Math.round(load15 * 100) / 100,
      // Carga relativa a la capacidad: 100 % = un proceso listo por nucleo.
      percentOfCapacity: cores > 0 ? Math.round((load1 / cores) * 1000) / 10 : null,
    },

    // --- Memoria ---
    memoryTotalBytes: memoryTotal,
    memoryFreeBytes: memoryFree,
    memoryUsedBytes: memoryTotal - memoryFree,
    memoryPercent:
      memoryTotal > 0
        ? Math.round(((memoryTotal - memoryFree) / memoryTotal) * 1000) / 10
        : null,

    // --- Sistema ---
    /** Segundos desde el ultimo arranque del HOST (no del contenedor). */
    uptimeSeconds: Math.floor(os.uptime()),
    /** Version del kernel: es la del anfitrion, porque se comparte. */
    kernel: os.release(),
    platform: os.platform(),
    arch: os.arch(),
    /** Segundos que lleva vivo el proceso del backend dentro del contenedor. */
    backendUptimeSeconds: Math.floor(process.uptime()),
  };
}
