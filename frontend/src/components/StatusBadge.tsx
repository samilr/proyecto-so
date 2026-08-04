/**
 * StatusBadge.tsx — Traduce el ActiveState de systemd a un indicador visual.
 *
 * El codigo de color es el que se explica en la demostracion:
 *   verde  = active        (corriendo; el punto late para verlo desde lejos)
 *   gris   = inactive      (detenido a proposito)
 *   rojo   = failed        (murio o no pudo arrancar)
 *   ambar  = activating / deactivating (transitorio)
 *   morado = unknown       (no se pudo consultar / unidad inexistente)
 */
import type { ServiceState } from '../types/api';

interface StatusConfig {
  label: string;
  badge: string;
  dot: string;
  pulse: boolean;
}

const STATUS_CONFIG: Record<ServiceState, StatusConfig> = {
  active: {
    label: 'Activo',
    badge:
      'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30',
    dot: 'bg-emerald-500 text-emerald-500',
    pulse: true,
  },
  inactive: {
    label: 'Inactivo',
    badge:
      'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/30',
    dot: 'bg-slate-400 text-slate-400',
    pulse: false,
  },
  failed: {
    label: 'Fallido',
    badge:
      'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/30',
    dot: 'bg-red-500 text-red-500',
    pulse: false,
  },
  activating: {
    label: 'Iniciando',
    badge:
      'bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30',
    dot: 'bg-amber-500 text-amber-500',
    pulse: true,
  },
  deactivating: {
    label: 'Deteniendo',
    badge:
      'bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30',
    dot: 'bg-amber-500 text-amber-500',
    pulse: true,
  },
  unknown: {
    label: 'Desconocido',
    badge:
      'bg-violet-100 text-violet-800 ring-violet-600/20 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-400/30',
    dot: 'bg-violet-400 text-violet-400',
    pulse: false,
  },
};

interface StatusBadgeProps {
  status: ServiceState;
  /** true cuando systemd responde LoadState=not-found. */
  notInstalled?: boolean;
  /** SubState de systemd (running, dead, exited...): detalle fino opcional. */
  subState?: string | null;
}

export function StatusBadge({ status, notInstalled = false, subState }: StatusBadgeProps) {
  // Fallback defensivo: si el backend anadiera un estado nuevo, no se rompe.
  const config = notInstalled
    ? {
        label: 'No instalado',
        badge:
          'bg-orange-100 text-orange-800 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/30',
        dot: 'bg-orange-500 text-orange-500',
        pulse: false,
      }
    : STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${config.badge}`}
      title={
        notInstalled
          ? 'systemd no encontro esta unidad en el servidor'
          : subState
            ? `systemd SubState: ${subState}`
            : undefined
      }
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {config.pulse && (
          <span className={`pulse-ring absolute inset-0 ${config.dot}`} aria-hidden="true" />
        )}
        <span className={`relative h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
      </span>
      {config.label}
    </span>
  );
}
