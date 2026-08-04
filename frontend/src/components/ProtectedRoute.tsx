/**
 * ProtectedRoute.tsx — Guardia de rutas del lado del cliente.
 *
 * Cubre dos casos:
 *   1) Sin sesion -> se envia a /login (recordando a donde queria ir, para
 *      volver ahi tras iniciar sesion).
 *   2) Con sesion pero sin rol admin en una ruta que lo exige (/logs) -> se
 *      devuelve al dashboard.
 *
 * IMPORTANTE PARA LA DEFENSA: esto es UX, no seguridad. Un usuario podria
 * saltarselo modificando el JavaScript en su navegador; lo que realmente
 * protege los datos es que el backend valida el JWT y el rol en cada
 * peticion y responde 401/403.
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Si es true, ademas de sesion se exige rol admin. */
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // replace: no deja la ruta protegida en el historial, para que el boton
    // "atras" del navegador no devuelva a una pantalla sin sesion.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
