import { useEffect, useRef, useState, type FormEvent } from 'react';

interface AddServiceModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function AddServiceModal({
  open,
  loading,
  error,
  onSubmit,
  onCancel,
}: AddServiceModalProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = name.trim();
    if (normalized && !loading) onSubmit(normalized);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-service-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <h2 id="add-service-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Agregar servicio
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Escriba el nombre de una unidad instalada. systemd la validara antes de agregarla a la lista blanca.
        </p>

        <label htmlFor="service-name" className="mt-5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Nombre del servicio
        </label>
        <input
          ref={inputRef}
          id="service-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={loading}
          placeholder="ej. cups o bluetooth.service"
          autoComplete="off"
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Agregarlo no lo inicia; luego podra controlarlo desde la tabla.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Validando…' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  );
}
