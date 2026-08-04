/**
 * ServiceTable.tsx — Tabla de servicios con sus estados de carga/error/vacio.
 */
import { useState } from 'react';
import { ServiceRow } from './ServiceRow';
import type { ServiceAction, ServiceStatus } from '../types/api';

interface ServiceTableProps {
  services: ServiceStatus[];
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  /** Nombre del servicio con una accion en curso, o null. */
  busyService: string | null;
  onAction: (service: ServiceStatus, action: ServiceAction) => void;
  onRemove: (service: ServiceStatus) => void;
}

/** Esqueleto de carga: da sensacion de rapidez en el primer render. */
function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <tr key={i} className="border-b border-slate-200 dark:border-slate-700">
          <td colSpan={6} className="px-4 py-4">
            <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function ServiceTable({
  services,
  isAdmin,
  loading,
  error,
  busyService,
  onAction,
  onRemove,
}: ServiceTableProps) {
  const showEmpty = !loading && !error && services.length === 0;
  const [expandedService, setExpandedService] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="hidden border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 md:table-header-group dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Servicio</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
              <th scope="col" className="px-4 py-3 font-medium">PID</th>
              <th scope="col" className="px-4 py-3 font-medium">Uptime</th>
              <th scope="col" className="px-4 py-3 font-medium">Memoria</th>
              <th scope="col" className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && services.length === 0 && <SkeletonRows />}

            {error && services.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    {error}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    El sondeo automatico seguira intentandolo cada 5 segundos.
                  </p>
                </td>
              </tr>
            )}

            {showEmpty && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  No hay servicios administrados. Un administrador puede usar{' '}
                  <strong>Agregar servicio</strong> para comenzar.
                </td>
              </tr>
            )}

            {services.map((service) => (
              <ServiceRow
                key={service.name}
                service={service}
                isAdmin={isAdmin}
                busy={busyService === service.name}
                expanded={expandedService === service.name}
                onToggleDetails={() =>
                  setExpandedService((current) =>
                    current === service.name ? null : service.name
                  )
                }
                onAction={onAction}
                onRemove={() => onRemove(service)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
