/**
 * ThemeToggle.tsx — Interruptor de modo claro/oscuro.
 *
 * Alterna la clase `dark` en <html> (Tailwind v4 con @custom-variant) y
 * guarda la eleccion en localStorage. La primera aplicacion ocurre en un
 * script inline de index.html, antes del primer pintado, para que no se vea
 * un destello blanco al recargar en modo oscuro.
 */
import { useCallback, useState } from 'react';

function isDarkNow(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function ThemeToggle() {
  const [dark, setDark] = useState(isDarkNow);

  const toggle = useCallback(() => {
    const next = !isDarkNow();
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('panel_theme', next ? 'dark' : 'light');
    } catch {
      /* almacenamiento no disponible: el tema dura lo que la pestana */
    }
    setDark(next);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-2 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
    </button>
  );
}
