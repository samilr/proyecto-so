/**
 * apiClient.ts — Unico punto de salida HTTP de la aplicacion.
 *
 * Centralizarlo aqui tiene tres ventajas concretas:
 *   1) El token JWT se adjunta en un solo sitio (nadie puede olvidarlo).
 *   2) Los errores del backend, que siempre llegan como
 *      { error: { code, message } }, se traducen a una excepcion tipada
 *      (ApiRequestError) que los componentes manejan de forma uniforme.
 *   3) El 401 se trata globalmente: si el token expiro o es invalido, se
 *      limpia la sesion una sola vez desde aqui y la app redirige al login.
 */
import type {
  ActionResponse,
  AddServiceResponse,
  ApiError,
  ApiErrorCode,
  LoginResponse,
  LogsResponse,
  RemoveServiceResponse,
  ServiceAction,
  ServiceDetailsResponse,
  ServiceStatus,
  ServicesResponse,
  SystemInfoResponse,
} from '../types/api';

/**
 * Base de la API.
 *  - En produccion (Docker) VITE_API_URL esta vacia => rutas RELATIVAS
 *    (`/api/...`). Las sirve el mismo Nginx que sirve la SPA y las reenvia al
 *    contenedor `backend`: mismo origen, por lo que no hay CORS.
 *  - En desarrollo local (`npm run dev`) se define VITE_API_URL con
 *    http://localhost:8000 porque Vite corre en el puerto 5173 (otro origen).
 */
const BASE_URL = import.meta.env.VITE_API_URL || '';

/** Claves de localStorage donde se persiste la sesion. */
export const TOKEN_KEY = 'panel_token';
export const USER_KEY = 'panel_user';

/** Error tipado con el codigo del contrato del backend. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Callback que ejecuta el AuthContext cuando el backend responde 401.
 * Se inyecta desde fuera (en vez de importar el contexto aqui) para no crear
 * una dependencia circular entre el cliente HTTP y el estado de React.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Modo privado del navegador o cookies bloqueadas: se opera sin sesion.
    return null;
  }
}

/** Comprueba en tiempo de ejecucion que el cuerpo tenga la forma ApiError. */
function isApiError(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null) return false;
  const maybe = body as { error?: unknown };
  if (typeof maybe.error !== 'object' || maybe.error === null) return false;
  const inner = maybe.error as { code?: unknown; message?: unknown };
  return typeof inner.code === 'string' && typeof inner.message === 'string';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Peticiones publicas (login) que no deben mandar el header Authorization. */
  skipAuth?: boolean;
  /** Permite cancelar la peticion (se usa al desmontar componentes). */
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!skipAuth) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    // Se relanza AbortError tal cual para que el llamador lo ignore en lugar
    // de mostrarlo como un fallo de red real.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Verifique que el backend este activo.'
    );
  }

  // 204 sin cuerpo: no hay JSON que parsear.
  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null; // respuesta no-JSON (p. ej. un error HTML de Nginx)
    }
  }

  if (!response.ok) {
    const code = isApiError(payload) ? payload.error.code : 'INTERNAL_ERROR';
    const message = isApiError(payload)
      ? payload.error.message
      : `Error ${response.status} al comunicarse con el servidor.`;

    // 401 GLOBAL: token ausente, invalido o expirado. Se cierra la sesion
    // una sola vez aqui; ProtectedRoute se encarga de llevar al /login.
    // El login en si se excluye: ahi un 401 significa "credenciales malas",
    // no "sesion caducada".
    if (response.status === 401 && !skipAuth) onUnauthorized?.();

    throw new ApiRequestError(response.status, code, message);
  }

  return payload as T;
}

/* ==================================================================== */
/*  Metodos de la API — uno por endpoint del backend                    */
/* ==================================================================== */

export const api = {
  /** POST /api/auth/login — publico. */
  login(username: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      skipAuth: true,
    });
  },

  /** GET /api/services — cualquier rol autenticado. */
  listServices(signal?: AbortSignal): Promise<ServicesResponse> {
    return request<ServicesResponse>('/api/services', { signal });
  },

  /** POST /api/services — agrega una unidad instalada a la lista dinamica. */
  addService(name: string): Promise<AddServiceResponse> {
    return request<AddServiceResponse>('/api/services', {
      method: 'POST',
      body: { name },
    });
  },

  /** DELETE /api/services/:name — la quita del panel, no del host. */
  removeService(name: string): Promise<RemoveServiceResponse> {
    return request<RemoveServiceResponse>(
      `/api/services/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
  },

  /** GET /api/services/:name — cualquier rol autenticado. */
  getService(name: string, signal?: AbortSignal): Promise<{ service: ServiceStatus }> {
    return request<{ service: ServiceStatus }>(
      `/api/services/${encodeURIComponent(name)}`,
      { signal }
    );
  },

  /** GET /api/services/:name/details — metadatos e historial del acordeon. */
  getServiceDetails(name: string, signal?: AbortSignal): Promise<ServiceDetailsResponse> {
    return request<ServiceDetailsResponse>(
      `/api/services/${encodeURIComponent(name)}/details`,
      { signal }
    );
  },

  /**
   * POST /api/services/:name/{start|stop|restart} — solo admin.
   * encodeURIComponent protege la URL aunque el backend ya valide el nombre
   * con su propio regex (defensa en profundidad en ambos extremos).
   */
  controlService(name: string, action: ServiceAction): Promise<ActionResponse> {
    return request<ActionResponse>(
      `/api/services/${encodeURIComponent(name)}/${action}`,
      { method: 'POST' }
    );
  },

  /**
   * GET /api/system — metricas del servidor anfitrion (CPU, RAM, uptime).
   * Cualquier rol autenticado: son datos de solo lectura.
   */
  getSystemInfo(signal?: AbortSignal): Promise<SystemInfoResponse> {
    return request<SystemInfoResponse>('/api/system', { signal });
  },

  /** GET /api/logs?limit=&offset= — solo admin. */
  getLogs(limit: number, offset: number, signal?: AbortSignal): Promise<LogsResponse> {
    return request<LogsResponse>(`/api/logs?limit=${limit}&offset=${offset}`, { signal });
  },
};
