/**
 * ConfirmModal.tsx — Confirmacion para las acciones destructivas.
 *
 * Detener o reiniciar un servicio del servidor tiene consecuencias reales
 * (nginx deja de responder, ssh puede cortar la sesion...). Por eso stop y
 * restart piden confirmacion explicita; start no, porque solo puede mejorar
 * la situacion.
 */
import { useEffect, useRef } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** 'danger' pinta el boton en rojo; 'warning' en ambar. */
  tone?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Accesibilidad: al abrir, el foco va al boton de confirmar y Escape cierra.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmStyles =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600'
      : 'bg-amber-500 hover:bg-amber-600 focus-visible:outline-amber-500';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      // Clic en el fondo = cancelar. Se comprueba el target para no cerrar
      // cuando el clic ocurre dentro de la tarjeta.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <h2
          id="confirm-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {message}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
