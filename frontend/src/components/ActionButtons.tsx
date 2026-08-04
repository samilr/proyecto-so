/**
 * ActionButtons.tsx — Botones Start / Stop / Restart de cada servicio.
 *
 * REGLA DE AUTORIZACION EN EL CLIENTE: si el rol es `viewer` no se renderiza
 * ningun boton. Es solo comodidad visual; la seguridad REAL la impone el
 * backend, que responde 403 FORBIDDEN a cualquier POST de un viewer aunque
 * alguien fabrique la peticion con curl. Nunca se confia en el frontend.
 */
import type { ServiceAction, ServiceState } from '../types/api';

interface ActionButtonsProps {
  status: ServiceState;
  isAdmin: boolean;
  /** true mientras la fila tiene una accion en curso. */
  busy: boolean;
  onAction: (action: ServiceAction) => void;
}

const BASE =
  'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-semibold text-white transition focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

export function ActionButtons({ status, isAdmin, busy, onAction }: ActionButtonsProps) {
  if (!isAdmin) {
    return (
      <span
        className="text-sm text-slate-400 dark:text-slate-500"
        title="Su rol es de solo lectura"
      >
        —
      </span>
    );
  }

  // Un servicio en transicion (activating/deactivating) tampoco admite
  // ordenes nuevas: se esperaria a que systemd termine el job actual.
  const inTransition = status === 'activating' || status === 'deactivating';
  const disabled = busy || inTransition;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onAction('start')}
        // Deshabilitado si ya esta activo: systemctl start seria un no-op.
        disabled={disabled || status === 'active'}
        className={`${BASE} bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600`}
        title="systemctl start"
      >
        Iniciar
      </button>

      <button
        type="button"
        onClick={() => onAction('stop')}
        disabled={disabled || status === 'inactive'}
        className={`${BASE} bg-red-600 hover:bg-red-700 focus-visible:outline-red-600`}
        title="systemctl stop"
      >
        Detener
      </button>

      <button
        type="button"
        onClick={() => onAction('restart')}
        disabled={disabled}
        className={`${BASE} bg-amber-500 hover:bg-amber-600 focus-visible:outline-amber-500`}
        title="systemctl restart"
      >
        Reiniciar
      </button>
    </div>
  );
}
