/**
 * LoginPage.tsx — Autenticacion contra POST /api/auth/login.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { ThemeToggle } from '../components/ThemeToggle';

const teamMembers = [
  { name: 'Carlos Arias', id: '25-0326' },
  { name: 'Samir Gonzales', id: '25-0808' },
  { name: 'Hansel Lopez', id: '25-0461' },
  { name: 'Elian Baez', id: '25-0489' },
];

/** Traduce el codigo de error del backend a un mensaje para el usuario. */
function messageForError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        return 'Usuario o contrasena incorrectos.';
      case 'RATE_LIMITED':
        return 'Demasiados intentos, espera un minuto.';
      case 'NETWORK_ERROR':
        return 'No se pudo conectar con el servidor. Verifica que el backend este activo.';
      default:
        return err.message;
    }
  }
  return 'Ocurrio un error inesperado al iniciar sesion.';
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si ya hay sesion, no tiene sentido mostrar el formulario: se vuelve a la
  // ruta que se intentaba abrir (o al dashboard).
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      // No se navega a mano: al cambiar isAuthenticated, el <Navigate> de
      // arriba se encarga de la redireccion.
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-xl font-bold text-white"
            aria-hidden="true"
          >
            ⚙
          </span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Panel de Servicios Systemd
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          noValidate
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-slate-900 ring-1 ring-slate-300 ring-inset transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600"
                placeholder="admin"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Contrasena
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-slate-900 ring-1 ring-slate-300 ring-inset transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            // role="alert": el lector de pantalla lo anuncia de inmediato.
            <p
              role="alert"
              className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
            )}
            {loading ? 'Verificando...' : 'Iniciar sesion'}
          </button>
        </form>

        <section
          aria-labelledby="team-heading"
          className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
        >
          <h2
            id="team-heading"
            className="text-center text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400"
          >
            Integrantes
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {teamMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800"
              >
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {member.name}
                </span>
                <span className="font-mono text-xs text-sky-700 dark:text-sky-400">
                  {member.id}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-4 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
          Esta aplicación web permite supervisar y administrar de forma
          centralizada los servicios systemd de un servidor Linux. Desde el
          panel puedes consultar en tiempo real su estado, consumo de CPU y
          memoria, procesos, PID y tiempo activo; también puedes iniciar,
          detener o reiniciar servicios, agregar nuevas unidades al panel y
          revisar el historial de comandos ejecutados con sus resultados, todo
          desde una interfaz sencilla y sin utilizar directamente la terminal.
        </p>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Proyecto final · Sistemas Operativos
        </p>
      </div>
    </div>
  );
}
