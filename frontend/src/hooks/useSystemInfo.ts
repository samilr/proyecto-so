/**
 * useSystemInfo.ts — Metricas del servidor anfitrion, con el mismo ritmo de
 * sondeo que los servicios (5 s) para que toda la pantalla cuente la misma
 * historia en el mismo instante.
 *
 * A diferencia de useServices, aqui NO se pausa durante las acciones: un
 * start/stop cambia precisamente la CPU y la memoria del host, y verlo
 * moverse en vivo es parte de la demostracion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiRequestError } from '../lib/apiClient';
import type { SystemInfo } from '../types/api';

const POLL_INTERVAL_MS = 5000;

interface UseSystemInfoResult {
  system: SystemInfo | null;
  loading: boolean;
  error: string | null;
}

export function useSystemInfo(): UseSystemInfoResult {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchSystem = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const data = await api.getSystemInfo(controller.signal);
      if (!mountedRef.current) return;
      setSystem(data.system);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      // El 401 lo gestiona el apiClient cerrando la sesion.
      if (err instanceof ApiRequestError && err.status !== 401) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchSystem();

    const interval = setInterval(() => void fetchSystem(), POLL_INTERVAL_MS);

    // Limpieza: sin esto el intervalo sobreviviria al cierre de sesion.
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [fetchSystem]);

  return { system, loading, error };
}
