/**
 * ServiceTable.tsx — Tabla de servicios con sus estados de carga/error/vacio.
 */
import { useState } from 'react';
import { ServiceRow } from './ServiceRow';
import type { ServiceAction, ServiceStatus, SystemInfo } from '../types/api';

/** Numero de columnas de la tabla; se usa en todos los colSpan. */
const COLUMNS = 7;

interface ServiceTableProps {
  services: ServiceStatus[];
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  /** Capacidad del host, para escalar los medidores de cada fila. */
  system: SystemInfo | null;
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
          <td colSpan={COLUMNS} className="px-4 py-4">
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
  system,
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
          <thead className="hidden border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 lg:table-header-group dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Servicio</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
              <th scope="col" className="px-4 py-3 font-medium" title="Porcentaje de un nucleo, como en top">
                CPU
              </th>
              <th scope="col" className="px-4 py-3 font-medium">Memoria</th>
              <th scope="col" className="px-4 py-3 font-medium" title="Procesos e hilos del cgroup del servicio">
                Procesos
              </th>
              <th scope="col" className="px-4 py-3 font-medium">Uptime</th>
              <th scope="col" className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && services.length === 0 && <SkeletonRows />}

            {error && services.length === 0 && (
              <tr>
                <td colSpan={COLUMNS} className="px-4 py-10 text-center">
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
                  colSpan={COLUMNS}
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
                system={system}
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
