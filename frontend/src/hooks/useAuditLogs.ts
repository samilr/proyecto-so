/**
 * useAuditLogs.ts — Bitacora de auditoria paginada.
 *
 * La paginacion se hace en el SERVIDOR (limit/offset) y no en el cliente:
 * la tabla audit_log crece sin limite y traerla entera al navegador seria
 * insostenible. El backend devuelve ademas `total`, que es lo que permite
 * saber si existe una pagina siguiente.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiRequestError } from '../lib/apiClient';
import type { AuditLogEntry } from '../types/api';

export const PAGE_SIZE = 20;

interface UseAuditLogsResult {
  logs: AuditLogEntry[];
  total: number;
  page: number; // pagina actual, base 0
  loading: boolean;
  error: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => void;
}

export function useAuditLogs(): UseAuditLogsResult {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cambiar este contador fuerza un refetch aunque la pagina sea la misma.
  const [reloadToken, setReloadToken] = useState(0);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const data = await api.getLogs(PAGE_SIZE, page * PAGE_SIZE, controller.signal);
        if (!mountedRef.current) return;
        setLogs(data.logs);
        setTotal(data.total);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!mountedRef.current) return;
        if (err instanceof ApiRequestError && err.status !== 401) {
          setError(err.message);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    void load();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [page, reloadToken]);

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    logs,
    total,
    page,
    loading,
    error,
    hasPrev: page > 0,
    hasNext: (page + 1) * PAGE_SIZE < total,
    nextPage,
    prevPage,
    refresh,
  };
}
