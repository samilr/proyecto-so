/**
 * Toast.tsx — Presentacion de las notificaciones flotantes.
 * La logica (cola, temporizadores) vive en ToastContext; aqui solo se pinta.
 */
import type { ToastItem, ToastVariant } from '../context/ToastContext';

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success:
    'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  error:
    'border-red-500/40 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
  info: 'border-sky-500/40 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'i',
};

const ICON_STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-red-500 text-white',
  info: 'bg-sky-500 text-white',
};

interface ToastListProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastList({ toasts, onDismiss }: ToastListProps) {
  if (toasts.length === 0) return null;

  return (
    // aria-live="polite": los lectores de pantalla anuncian los mensajes
    // nuevos sin interrumpir lo que el usuario este haciendo.
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:w-full"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ring-1 ring-black/5 ${VARIANT_STYLES[toast.variant]}`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ICON_STYLES[toast.variant]}`}
            aria-hidden="true"
          >
            {VARIANT_ICONS[toast.variant]}
          </span>
          <p className="flex-1 text-sm leading-snug break-words">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded p-0.5 text-lg leading-none opacity-60 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Cerrar notificacion"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
