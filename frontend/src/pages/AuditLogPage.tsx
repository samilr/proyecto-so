/**
 * AuditLogPage.tsx — Bitacora de auditoria (ruta /logs, solo admin).
 *
 * Muestra la trazabilidad completa del panel: quien inicio sesion y quien
 * ejecuto cada accion sobre un servicio, con su resultado. La proteccion de
 * la ruta la hace ProtectedRoute en el cliente y requireAdmin en el backend.
 */
import { PAGE_SIZE, useAuditLogs } from '../hooks/useAuditLogs';
import { ACTION_LABELS, formatDateTime } from '../lib/format';

export function AuditLogPage() {
  const { logs, total, page, loading, error, hasPrev, hasNext, nextPage, prevPage, refresh } =
    useAuditLogs();

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Bitacora de auditoria
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {total > 0
              ? `Mostrando ${from}–${to} de ${total} registros`
              : 'Sin registros todavia'}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 ring-inset transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
        >
          Actualizar
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                <th scope="col" className="px-4 py-3 font-medium">Usuario</th>
                <th scope="col" className="px-4 py-3 font-medium">Accion</th>
                <th scope="col" className="px-4 py-3 font-medium">Servicio</th>
                <th scope="col" className="px-4 py-3 font-medium">Resultado</th>
                <th scope="col" className="px-4 py-3 font-medium">Detalle</th>
              </tr>
            </thead>

            <tbody>
              {loading && logs.length === 0 && (
                <>
                  {[0, 1, 2, 3].map((i) => (
                    <tr key={i} className="border-b border-slate-200 dark:border-slate-700">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {error && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm font-medium text-red-600 dark:text-red-400"
                  >
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && logs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No hay registros de auditoria en esta pagina.
                  </td>
                </tr>
              )}

              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-slate-200 last:border-0 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100">
                    {log.username}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-300">
                    {log.service ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {log.success ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <span aria-hidden="true">✓</span> Exito
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                        <span aria-hidden="true">✕</span> Fallo
                      </span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="line-clamp-2 break-words" title={log.detail ?? undefined}>
                      {log.detail ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginacion servidor: limit/offset + total */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pagina {page + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={prevPage}
              disabled={!hasPrev || loading}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 ring-inset transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={nextPage}
              disabled={!hasNext || loading}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 ring-inset transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
