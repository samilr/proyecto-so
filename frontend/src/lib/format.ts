/**
 * format.ts — Formateo de los valores crudos que envia systemd para que sean
 * legibles en pantalla durante la demostracion.
 */

/**
 * Segundos -> "2h 14m" / "3d 5h" / "45s".
 * systemd reporta el arranque del proceso; aqui se traduce a algo humano.
 */
export function formatUptime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}s`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Bytes -> "12.0 MB".
 * Se usan multiplos de 1024 (que es como los contabiliza el kernel en el
 * cgroup de memoria) y se etiquetan KB/MB/GB por ser lo habitual en paneles.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  const unit = units[exponent] ?? 'B';

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${unit}`;
}

/**
 * Porcentaje -> "12.4 %".
 * Se admite > 100 a proposito: el %CPU de un servicio es porcentaje de UN
 * nucleo (convencion de `top`), asi que 240 % significa 2.4 nucleos ocupados.
 */
export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)} %`;
}

/** Numero entero con separador de miles: 1234 -> "1,234". */
export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('es-DO');
}

/**
 * Tiempo de CPU acumulado (segundos) -> "1h 12m" / "3m 4s" / "820ms".
 * Es el equivalente de la columna TIME de `top`: cuanta CPU ha consumido el
 * servicio en total, no cuanta esta usando ahora.
 */
export function formatCpuTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds === 0) return '0s';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/** Etiqueta legible del UnitFileState de systemd. */
export const UNIT_FILE_STATE_LABELS: Record<string, string> = {
  enabled: 'Arranca en el boot',
  'enabled-runtime': 'Habilitado (temporal)',
  disabled: 'No arranca en el boot',
  static: 'Sin habilitacion propia',
  masked: 'Enmascarado',
  indirect: 'Habilitado indirectamente',
  generated: 'Generado por systemd',
};

/** ISO 8601 -> fecha y hora local en formato dominicano (es-DO). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** Solo la hora local, para el sello de "ultima actualizacion" del polling. */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-DO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** Etiquetas en espanol de las acciones, para toasts y tablas. */
export const ACTION_LABELS: Record<string, string> = {
  start: 'Iniciar',
  stop: 'Detener',
  restart: 'Reiniciar',
  login: 'Inicio de sesion',
  add_service: 'Agregar servicio',
  remove_service: 'Quitar servicio',
};

/** Participio para los mensajes de exito: "nginx reiniciado correctamente". */
export const ACTION_PAST_PARTICIPLE: Record<string, string> = {
  start: 'iniciado',
  stop: 'detenido',
  restart: 'reiniciado',
};
