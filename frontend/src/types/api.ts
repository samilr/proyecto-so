/**
 * types/api.ts — Contrato de datos compartido con el backend Express.
 *
 * Estos tipos son la traduccion literal de las respuestas documentadas en
 * backend/README.md. Cualquier cambio aqui debe hacerse a la vez que en el
 * backend: son el "acuerdo" entre las dos mitades del proyecto.
 */

export type Role = 'admin' | 'viewer';
export type ServiceState =
  | 'active'
  | 'inactive'
  | 'failed'
  | 'activating'
  | 'deactivating'
  | 'unknown';
export type ServiceAction = 'start' | 'stop' | 'restart';

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ServiceStatus {
  name: string;
  description: string;
  status: ServiceState;
  subState: string;
  pid: number | null;
  uptimeSeconds: number | null;
  memoryBytes: number | null;
}

export interface ServicesResponse {
  services: ServiceStatus[];
}

export interface ActionResponse {
  action: ServiceAction;
  service: ServiceStatus; // estado DESPUES de la accion
  executedAt: string; // ISO 8601
}

export interface AuditLogEntry {
  id: number;
  username: string;
  action: ServiceAction | 'login';
  service: string | null;
  success: boolean;
  detail: string | null;
  timestamp: string; // ISO 8601
}

export interface LogsResponse {
  total: number;
  logs: AuditLogEntry[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** Codigos de error que puede devolver el backend. */
export type ApiErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SERVICE_NOT_ALLOWED'
  | 'INVALID_SERVICE_NAME'
  | 'SYSTEMCTL_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';
