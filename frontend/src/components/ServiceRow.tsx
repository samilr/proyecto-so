/**
 * ServiceRow.tsx — Una fila de la tabla (escritorio) y una tarjeta (movil).
 *
 * Se renderizan las dos variantes y Tailwind muestra una u otra segun el
 * ancho de la pantalla: es el enfoque mas simple para que una tabla de 7
 * columnas siga siendo legible en un telefono.
 *
 * SOBRE LOS MEDIDORES: el %CPU y la memoria de un servicio no significan
 * nada en el vacio; hay que compararlos con la capacidad de la maquina. Por
 * eso las barras se escalan contra los datos del host:
 *   - CPU:     nucleos x 100 %  (la capacidad total de computo)
 *   - Memoria: memoria total del servidor
 * El numero de al lado siempre muestra el valor real, sin escalar.
 */
import { ActionButtons } from './ActionButtons';
import { MeterBar } from './MeterBar';
import { ServiceDetailsPanel } from './ServiceDetailsPanel';
import { StatusBadge } from './StatusBadge';
import { formatBytes, formatCount, formatPercent, formatUptime } from '../lib/format';
import type { ServiceAction, ServiceStatus, SystemInfo } from '../types/api';

interface ServiceRowProps {
  service: ServiceStatus;
  isAdmin: boolean;
  busy: boolean;
  expanded: boolean;
  /** Capacidad del host, para escalar los medidores. */
  system: SystemInfo | null;
  onToggleDetails: () => void;
  onAction: (service: ServiceStatus, action: ServiceAction) => void;
  onRemove: () => void;
}

/** Spinner que aparece en la fila mientras systemctl trabaja. */
function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600 dark:border-slate-600 dark:border-t-sky-400"
      role="status"
      aria-label="Ejecutando accion"
    />
  );
}

/** Celda de metrica: numero legible + medidor contra la capacidad del host. */
function MetricCell({
  text,
  hint,
  value,
  max,
  warnAt,
  criticalAt,
  label,
}: {
  text: string;
  hint?: string;
  value: number | null;
  max: number;
  warnAt?: number;
  criticalAt?: number;
  label: string;
}) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">{text}</p>
      <MeterBar
        value={value}
        max={max}
        warnAt={warnAt}
        criticalAt={criticalAt}
        label={label}
        className="mt-1.5"
      />
      {hint && (
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function ServiceRow({
  service,
  isAdmin,
  busy,
  expanded,
  system,
  onToggleDetails,
  onAction,
  onRemove,
}: ServiceRowProps) {
  const handle = (action: ServiceAction) => onAction(service, action);
  const notInstalled = service.loadState === 'not-found';
  const description = notInstalled
    ? `No se encontro ${service.name}.service en este servidor.`
    : service.description || 'Sin descripcion';

  // Capacidad total de computo del host: 4 nucleos = 400 % en la escala de
  // `top`. Si aun no llego /api/system se asume 1 nucleo para no dividir por
  // cero; el numero mostrado no depende de esto, solo el ancho de la barra.
  const cpuCapacity = (system?.cpuCores ?? 1) * 100;
  const hostMemory = system?.memoryTotalBytes ?? 0;

  const cpuText = formatPercent(service.cpuPercent);
  // Se explica la ausencia de dato en lugar de dejar un guion mudo: el %CPU
  // es una derivada y necesita dos muestras del contador acumulado.
  const cpuHint =
    service.cpuPercent === null && service.status === 'active'
      ? 'midiendo…'
      : service.cpuSeconds !== null && service.cpuPercent !== null
        ? `${formatPercent((service.cpuPercent / cpuCapacity) * 100, 1)} del total`
        : undefined;

  const memoryText = formatBytes(service.memoryBytes);
  const memoryHint =
    service.memoryBytes !== null && hostMemory > 0
      ? `${formatPercent((service.memoryBytes / hostMemory) * 100, 1)} del total`
      : undefined;

  const restartsBadge =
    service.restarts !== null && service.restarts > 0 ? (
      <span
        className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        title="Reinicios automaticos aplicados por la politica Restart= de systemd"
      >
        ↻ {service.restarts}
      </span>
    ) : null;

  const detailsButton = (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={`details-${service.name}`}
      onClick={onToggleDetails}
      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
    >
      <span aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
        ›
      </span>
      {expanded ? 'Ocultar detalles' : 'Ver detalles'}
    </button>
  );

  return (
    <>
      {/* ---------- Fila de escritorio (>= lg) ---------- */}
      <tr className="hidden border-b border-slate-200 last:border-0 transition-colors hover:bg-slate-50 lg:table-row dark:border-slate-700 dark:hover:bg-slate-800/50">
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
              {service.name}
            </span>
            {busy && <Spinner />}
            {restartsBadge}
          </div>
          <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
          {detailsButton}
        </td>

        <td className="px-4 py-3 align-top">
          <StatusBadge
            status={service.status}
            notInstalled={notInstalled}
            subState={service.subState}
          />
        </td>

        <td className="px-4 py-3 align-top">
          <MetricCell
            text={cpuText}
            hint={cpuHint}
            value={service.cpuPercent}
            max={cpuCapacity}
            warnAt={60}
            criticalAt={85}
            label={`Uso de CPU de ${service.name}`}
          />
        </td>

        <td className="px-4 py-3 align-top">
          <MetricCell
            text={memoryText}
            hint={memoryHint}
            value={service.memoryBytes}
            max={hostMemory}
            warnAt={40}
            criticalAt={70}
            label={`Memoria de ${service.name}`}
          />
        </td>

        <td className="px-4 py-3 align-top">
          <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
            {formatCount(service.tasks)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-500">
            PID {service.pid ?? '—'}
          </p>
        </td>

        <td className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
          {formatUptime(service.uptimeSeconds)}
        </td>

        <td className="px-4 py-3 align-top">
          <ActionButtons
            status={service.status}
            isAdmin={isAdmin}
            unavailable={notInstalled}
            busy={busy}
            onAction={handle}
          />
        </td>
      </tr>

      {/* ---------- Tarjeta de movil / tablet (< lg) ---------- */}
      <tr className="lg:hidden">
        <td colSpan={7} className="block border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {service.name}
                </span>
                {busy && <Spinner />}
                {restartsBadge}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {description}
              </p>
              {detailsButton}
            </div>
            <StatusBadge
              status={service.status}
              notInstalled={notInstalled}
              subState={service.subState}
            />
          </div>

          {/* Las dos metricas con medidor ocupan una fila propia para que las
              barras tengan ancho suficiente para leerse. */}
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">CPU</dt>
              <dd className="mt-0.5">
                <MetricCell
                  text={cpuText}
                  hint={cpuHint}
                  value={service.cpuPercent}
                  max={cpuCapacity}
                  warnAt={60}
                  criticalAt={85}
                  label={`Uso de CPU de ${service.name}`}
                />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Memoria</dt>
              <dd className="mt-0.5">
                <MetricCell
                  text={memoryText}
                  hint={memoryHint}
                  value={service.memoryBytes}
                  max={hostMemory}
                  warnAt={40}
                  criticalAt={70}
                  label={`Memoria de ${service.name}`}
                />
              </dd>
            </div>
          </dl>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Procesos</dt>
              <dd className="tabular-nums text-slate-800 dark:text-slate-200">
                {formatCount(service.tasks)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">PID</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {service.pid ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Uptime</dt>
              <dd className="text-slate-800 dark:text-slate-200">
                {formatUptime(service.uptimeSeconds)}
              </dd>
            </div>
          </dl>

          <div className="mt-3">
            <ActionButtons
              status={service.status}
              isAdmin={isAdmin}
              unavailable={notInstalled}
              busy={busy}
              onAction={handle}
            />
          </div>
        </td>
      </tr>

      {/* Un unico panel compartido por escritorio y movil. Asi se evita
          duplicar la consulta HTTP aunque ambas variantes de fila existan. */}
      {expanded && (
        <tr className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/50">
          <td colSpan={7} className="px-4 py-4">
            <div id={`details-${service.name}`}>
              <ServiceDetailsPanel
                service={service}
                refreshKey={`${service.status}-${service.pid ?? 0}`}
                isAdmin={isAdmin}
                busy={busy}
                onRemove={onRemove}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
