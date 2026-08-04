/**
 * AuthContext.tsx — Estado de sesion de toda la aplicacion.
 *
 * No se usa Redux ni Zustand: el estado global del panel es minimo (usuario +
 * token), asi que la Context API de React es suficiente y evita una
 * dependencia mas que defender.
 *
 * La sesion se persiste en localStorage para que un F5 no eche al usuario.
 * NOTA DE SEGURIDAD (para la defensa): localStorage es vulnerable a XSS. Se
 * acepta en este proyecto academico porque no hay contenido de terceros ni
 * HTML generado por el usuario. La alternativa robusta seria una cookie
 * httpOnly + SameSite emitida por el backend, que JavaScript no puede leer.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler, TOKEN_KEY, USER_KEY } from '../lib/apiClient';
import type { Role, User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Lee y valida la sesion guardada. Si esta corrupta, se descarta. */
function readStoredSession(): { user: User | null; token: string | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    if (!token || !rawUser) return { user: null, token: null };

    const parsed = JSON.parse(rawUser) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as User).id === 'number' &&
      typeof (parsed as User).username === 'string' &&
      ((parsed as User).role === 'admin' || (parsed as User).role === 'viewer')
    ) {
      return { user: parsed as User, token };
    }
    return { user: null, token: null };
  } catch {
    return { user: null, token: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicializacion perezosa: se lee localStorage una sola vez, en el primer
  // render, y no en cada re-render del provider.
  const [session, setSession] = useState(readStoredSession);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* almacenamiento no disponible: basta con limpiar el estado */
    }
    setSession({ user: null, token: null });
  }, []);

  /**
   * Se registra el manejador global de 401 del apiClient: cuando el token
   * expira (8h) o es invalido, CUALQUIER peticion cierra la sesion y
   * ProtectedRoute redirige al login automaticamente.
   */
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  /**
   * Sincroniza la sesion entre pestanas: si el usuario cierra sesion en una,
   * las demas se enteran por el evento `storage` del navegador.
   */
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === TOKEN_KEY || event.key === USER_KEY) {
        setSession(readStoredSession());
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // Los errores (INVALID_CREDENTIALS, RATE_LIMITED...) se propagan tal cual
    // para que LoginPage los muestre con su mensaje especifico.
    const data = await api.login(username, password);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {
      /* si no se puede persistir, la sesion vive solo en memoria */
    }
    setSession({ user: data.user, token: data.token });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session.user,
      token: session.token,
      isAuthenticated: session.user !== null && session.token !== null,
      isAdmin: session.user?.role === 'admin',
      login,
      logout,
    }),
    [session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook de acceso al contexto. Falla ruidosamente si falta el provider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Etiqueta legible del rol, usada en la barra de navegacion. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  viewer: 'Solo lectura',
};
