/**
 * Layout.tsx — Marco comun de las paginas autenticadas: barra de navegacion
 * con el titulo, el usuario, su badge de rol, el interruptor de tema y el
 * boton de cerrar sesion.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABELS, useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';

/** Estilo del enlace activo del menu. */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    'rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
  return isActive
    ? `${base} bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200`
    : `${base} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`;
}

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          {/* Marca */}
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white"
              aria-hidden="true"
            >
              ⚙
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Panel de Servicios
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                systemd · Sistemas Operativos
              </p>
            </div>
          </div>

          {/* Navegacion. /logs solo se muestra a los administradores. */}
          <nav className="flex items-center gap-1" aria-label="Principal">
            <NavLink to="/" end className={navLinkClass}>
              Servicios
            </NavLink>
            {isAdmin && (
              <NavLink to="/logs" className={navLinkClass}>
                Auditoria
              </NavLink>
            )}
          </nav>

          {/* Usuario y sesion */}
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />

            {user && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {user.username}
                </p>
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isAdmin
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 ring-inset transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Outlet: aqui react-router inyecta la pagina de la ruta activa. */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
