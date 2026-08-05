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
  description: string | null;
  /** Estado de carga de systemd; "not-found" significa unidad no instalada. */
  loadState: string | null;
  status: ServiceState;
  subState: string | null;
  pid: number | null;
  uptimeSeconds: number | null;
  memoryBytes: number | null;

  /* --- Metricas de recursos (derivadas de systemctl show) --- */
  /**
   * Porcentaje de UN nucleo, igual que `top`: 200 % = dos nucleos saturados.
   * Es null hasta que el backend tiene DOS muestras del contador acumulado
   * CPUUsageNSec, es decir, tras el segundo sondeo (~5 s despues de abrir).
   */
  cpuPercent: number | null;
  /** Tiempo de CPU acumulado, en segundos, desde que arranco el servicio. */
  cpuSeconds: number | null;
  /** Procesos + hilos del cgroup (pids.current en cgroup v2). */
  tasks: number | null;
  /** Limite de tareas del cgroup, si la unidad tiene TasksMax configurado. */
  tasksMax: number | null;
  /** Reinicios automaticos aplicados por la politica Restart= de la unidad. */
  restarts: number | null;
  /** enabled | disabled | static | masked: si arranca solo en cada boot. */
  unitFileState: string | null;
}

/** Metricas globales del servidor anfitrion (GET /api/system). */
export interface SystemInfo {
  cpuCores: number;
  /** Uso de CPU de TODO el host, 0–100. null en la primera lectura. */
  cpuPercent: number | null;
  loadAverage: {
    one: number;
    five: number;
    fifteen: number;
    /** Carga de 1 min relativa al numero de nucleos: 100 % = saturado. */
    percentOfCapacity: number | null;
  };
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryPercent: number | null;
  /** Segundos desde el ultimo arranque del HOST. */
  uptimeSeconds: number;
  /** Version del kernel del anfitrion (el contenedor comparte ese kernel). */
  kernel: string;
  platform: string;
  arch: string;
  /** Segundos que lleva vivo el proceso del backend en el contenedor. */
  backendUptimeSeconds: number;
}

export interface SystemInfoResponse {
  system: SystemInfo;
}

export interface ServicesResponse {
  services: ServiceStatus[];
}

export interface AddServiceResponse {
  service: ServiceStatus;
  addedAt: string;
}

export interface RemoveServiceResponse {
  removed: string;
  removedAt: string;
}

export interface ActionResponse {
  action: ServiceAction;
  command: string;
  service: ServiceStatus; // estado DESPUES de la accion
  executedAt: string; // ISO 8601
}

export interface ServiceMetadata {
  unitFileState: string | null;
  unitPath: string | null;
  serviceType: string | null;
  restartPolicy: string | null;
  execStart: string | null;
}

export interface ServiceCommandEntry {
  id: number;
  username: string;
  action: ServiceAction;
  command: string;
  success: boolean;
  detail: string | null;
  timestamp: string;
}

export interface ServiceDetailsResponse {
  service: ServiceStatus;
  metadata: ServiceMetadata;
  canViewCommands: boolean;
  commands: ServiceCommandEntry[];
}

export interface AuditLogEntry {
  id: number;
  username: string;
  action: ServiceAction | 'login' | 'add_service' | 'remove_service';
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
  | 'SERVICE_ALREADY_MANAGED'
  | 'SERVICE_NOT_INSTALLED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_SERVICE_NAME'
  | 'SYSTEMCTL_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';
