/**
 * useServices.ts — Estado de los servicios del host con refresco automatico.
 *
 * POR QUE POLLING Y NO WEBSOCKETS:
 * systemd no "empuja" notificaciones hacia nuestra API; para saber el estado
 * hay que preguntarle (`systemctl show`). Un WebSocket solo trasladaria el
 * mismo sondeo al servidor, con mas complejidad. Cada 5 s es un buen
 * compromiso entre frescura y carga sobre el D-Bus del host.
 *
 * DETALLE IMPORTANTE (requisito del proyecto): el sondeo se PAUSA mientras
 * hay una accion start/stop/restart en curso. Si no, una respuesta del
 * polling emitida antes de la accion podria llegar despues y sobrescribir el
 * estado nuevo con el viejo (condicion de carrera visible en pantalla).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiRequestError } from '../lib/apiClient';
import type { ServiceStatus } from '../types/api';

const POLL_INTERVAL_MS = 5000;

interface UseServicesResult {
  services: ServiceStatus[];
  /** Solo true durante la PRIMERA carga (los refrescos no muestran spinner). */
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  /** Fuerza un refresco inmediato. */
  refresh: () => Promise<void>;
  /** Pausa/reanuda el sondeo (se usa durante las acciones). */
  setPaused: (paused: boolean) => void;
  /** Reemplaza un servicio con el estado devuelto por una accion. */
  updateService: (service: ServiceStatus) => void;
}

export function useServices(): UseServicesResult {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // En refs (no en estado) para que cambiarlos no dispare re-renders ni
  // recree el intervalo.
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchServices = useCallback(async () => {
    // Cancela una peticion anterior aun en vuelo: si el usuario pulsa
    // "actualizar" repetidamente, solo interesa la ultima respuesta.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const data = await api.listServices(controller.signal);
      if (!mountedRef.current) return;
      setServices(data.services);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      // El abort es intencionado: no es un error que mostrar.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      // El 401 ya lo maneja el apiClient (cierra sesion): no se muestra error.
      if (err instanceof ApiRequestError && err.status !== 401) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchServices();

    const interval = setInterval(() => {
      if (!pausedRef.current) void fetchServices();
    }, POLL_INTERVAL_MS);

    // LIMPIEZA: sin esto, el intervalo seguiria vivo tras salir del dashboard
    // (fuga de memoria y peticiones fantasma con la sesion ya cerrada).
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [fetchServices]);

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
  }, []);

  const updateService = useCallback((updated: ServiceStatus) => {
    setServices((prev) =>
      prev.map((s) => (s.name === updated.name ? updated : s))
    );
    setLastUpdated(new Date());
  }, []);

  return {
    services,
    loading,
    error,
    lastUpdated,
    refresh: fetchServices,
    setPaused,
    updateService,
  };
}
