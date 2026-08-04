import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '../lib/apiClient';
import { formatBytes, formatDateTime, formatUptime } from '../lib/format';
import type { ServiceDetailsResponse, ServiceStatus } from '../types/api';

interface ServiceDetailsPanelProps {
  service: ServiceStatus;
  refreshKey: string;
  isAdmin: boolean;
  busy: boolean;
  onRemove: () => void;
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-slate-800 dark:text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

export function ServiceDetailsPanel({
  service,
  refreshKey,
  isAdmin,
  busy,
  onRemove,
}: ServiceDetailsPanelProps) {
  const [details, setDetails] = useState<ServiceDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await api.getServiceDetails(service.name, signal);
      setDetails(result);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'No se pudieron cargar los detalles del servicio.'
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [service.name]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  if (loading && !details) {
    return <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  }

  if (error && !details) {
    return <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>;
  }

  const current = details?.service ?? service;
  const metadata = details?.metadata;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Detalles de {service.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Informacion obtenida directamente de systemd</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 ring-inset hover:bg-white disabled:opacity-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
          >
            {loading ? 'Actualizando…' : 'Actualizar detalles'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:ring-red-800 dark:hover:bg-red-950"
            >
              Quitar del panel
            </button>
          )}
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Estado" value={`${current.status}${current.subState ? ` · ${current.subState}` : ''}`} />
        <DetailItem label="PID principal" value={current.pid?.toString() ?? '—'} mono />
        <DetailItem label="Tiempo activo" value={formatUptime(current.uptimeSeconds)} />
        <DetailItem label="Memoria" value={formatBytes(current.memoryBytes)} />
        <DetailItem label="Carga" value={current.loadState ?? '—'} mono />
        <DetailItem label="Habilitado" value={metadata?.unitFileState ?? '—'} mono />
        <DetailItem label="Tipo" value={metadata?.serviceType ?? '—'} mono />
        <DetailItem label="Politica de reinicio" value={metadata?.restartPolicy ?? '—'} mono />
        <div className="sm:col-span-2 lg:col-span-4">
          <DetailItem label="Archivo de unidad" value={metadata?.unitPath ?? '—'} mono />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <DetailItem label="Comando de arranque (ExecStart)" value={metadata?.execStart ?? 'No reportado por systemd'} mono />
        </div>
      </dl>

      <section className="overflow-hidden rounded-xl border border-slate-700 bg-[#0b1220] shadow-inner" aria-label={`Terminal de ${service.name}`}>
        <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 font-mono text-xs text-slate-300">terminal · {service.name}</span>
        </div>
        <div className="max-h-72 space-y-4 overflow-y-auto p-4 font-mono text-xs leading-5">
          <p className="text-slate-400"># Ultimos comandos ejecutados desde el panel</p>
          {details && !details.canViewCommands ? (
            <p className="text-slate-500">$ historial disponible solo para administradores</p>
          ) : details?.commands.length ? (
            details.commands.map((entry) => (
              <div key={entry.id} className="border-l-2 border-slate-700 pl-3">
                <p className="text-slate-500">[{formatDateTime(entry.timestamp)}] usuario: {entry.username}</p>
                <p className="break-all text-slate-100"><span className="text-emerald-400">$</span> {entry.command}</p>
                <p className={entry.success ? 'text-emerald-400' : 'text-red-400'}>
                  {entry.success ? '✓ Comando completado correctamente' : `✕ ${entry.detail ?? 'El comando fallo'}`}
                </p>
              </div>
            ))
          ) : (
            <p className="text-slate-500">$ aun no hay comandos registrados para este servicio</p>
          )}
        </div>
      </section>
    </div>
  );
}
