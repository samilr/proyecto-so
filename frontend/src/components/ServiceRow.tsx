/**
 * ServiceRow.tsx — Una fila de la tabla (escritorio) y una tarjeta (movil).
 *
 * Se renderizan las dos variantes y Tailwind muestra una u otra segun el
 * ancho de la pantalla: es el enfoque mas simple para que una tabla de 6
 * columnas siga siendo legible en un telefono.
 */
import { ActionButtons } from './ActionButtons';
import { ServiceDetailsPanel } from './ServiceDetailsPanel';
import { StatusBadge } from './StatusBadge';
import { formatBytes, formatUptime } from '../lib/format';
import type { ServiceAction, ServiceStatus } from '../types/api';

interface ServiceRowProps {
  service: ServiceStatus;
  isAdmin: boolean;
  busy: boolean;
  expanded: boolean;
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

export function ServiceRow({
  service,
  isAdmin,
  busy,
  expanded,
  onToggleDetails,
  onAction,
  onRemove,
}: ServiceRowProps) {
  const handle = (action: ServiceAction) => onAction(service, action);
  const notInstalled = service.loadState === 'not-found';
  const description = notInstalled
    ? `No se encontro ${service.name}.service en este servidor.`
    : service.description || 'Sin descripcion';

  return (
    <>
      {/* ---------- Fila de escritorio (>= md) ---------- */}
      <tr className="hidden border-b border-slate-200 last:border-0 transition-colors hover:bg-slate-50 md:table-row dark:border-slate-700 dark:hover:bg-slate-800/50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
              {service.name}
            </span>
            {busy && <Spinner />}
          </div>
          <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
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
        </td>
        <td className="px-4 py-3">
          <StatusBadge
            status={service.status}
            notInstalled={notInstalled}
            subState={service.subState}
          />
        </td>
        <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-300">
          {service.pid ?? '—'}
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          {formatUptime(service.uptimeSeconds)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          {formatBytes(service.memoryBytes)}
        </td>
        <td className="px-4 py-3">
          <ActionButtons
            status={service.status}
            isAdmin={isAdmin}
            unavailable={notInstalled}
            busy={busy}
            onAction={handle}
          />
        </td>
      </tr>

      {/* ---------- Tarjeta de movil (< md) ---------- */}
      <tr className="md:hidden">
        <td colSpan={6} className="block border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {service.name}
                </span>
                {busy && <Spinner />}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {description}
              </p>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`details-${service.name}`}
                onClick={onToggleDetails}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-400"
              >
                <span aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
                  ›
                </span>
                {expanded ? 'Ocultar detalles' : 'Ver detalles'}
              </button>
            </div>
            <StatusBadge
              status={service.status}
              notInstalled={notInstalled}
              subState={service.subState}
            />
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
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
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Memoria</dt>
              <dd className="text-slate-800 dark:text-slate-200">
                {formatBytes(service.memoryBytes)}
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
          <td colSpan={6} className="px-4 py-4">
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
