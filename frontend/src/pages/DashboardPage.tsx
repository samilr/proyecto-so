/**
 * DashboardPage.tsx — Pantalla principal: estado de los servicios del host y
 * los controles start/stop/restart.
 *
 * FLUJO DE UNA ACCION (lo que se explica en la demostracion):
 *   1. El admin pulsa Reiniciar -> se abre ConfirmModal (stop y restart son
 *      destructivos; start no pide confirmacion).
 *   2. Al confirmar se PAUSA el sondeo para que una respuesta vieja no pise
 *      el estado nuevo, y la fila se marca como ocupada (spinner).
 *   3. POST /api/services/nginx/restart -> el backend ejecuta systemctl
 *      contra el D-Bus del host y responde con el estado POSTERIOR.
 *   4. Se sustituye ese servicio en la tabla con el estado devuelto y se
 *      muestra el toast.
 *   5. Se reanuda el sondeo y se pide un refresco inmediato (systemd puede
 *      seguir en 'activating' un instante despues de responder).
 */
import { useCallback, useMemo, useState } from 'react';
import { ServiceTable } from '../components/ServiceTable';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useServices } from '../hooks/useServices';
import { api, ApiRequestError } from '../lib/apiClient';
import { ACTION_PAST_PARTICIPLE, formatTime } from '../lib/format';
import type { ServiceAction, ServiceStatus } from '../types/api';

/** Acciones que exigen confirmacion explicita del usuario. */
const NEEDS_CONFIRMATION: ServiceAction[] = ['stop', 'restart'];

interface PendingAction {
  service: ServiceStatus;
  action: ServiceAction;
}

export function DashboardPage() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const {
    services,
    loading,
    error,
    lastUpdated,
    refresh,
    setPaused,
    updateService,
  } = useServices();

  const [busyService, setBusyService] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const activeCount = useMemo(
    () => services.filter((s) => s.status === 'active').length,
    [services]
  );

  /** Ejecuta la accion ya confirmada contra la API. */
  const runAction = useCallback(
    async (service: ServiceStatus, action: ServiceAction) => {
      setBusyService(service.name);
      setPaused(true); // evita la condicion de carrera con el polling

      try {
        const result = await api.controlService(service.name, action);
        updateService(result.service);
        showToast(
          'success',
          `${service.name} ${ACTION_PAST_PARTICIPLE[action] ?? action} correctamente.`
        );
      } catch (err) {
        // El backend devuelve SYSTEMCTL_ERROR con el stderr real de systemctl:
        // mostrarlo tal cual es lo mas util para diagnosticar en vivo.
        const message =
          err instanceof ApiRequestError
            ? err.message
            : 'Error inesperado al ejecutar la accion.';
        showToast('error', message);
      } finally {
        setBusyService(null);
        setPaused(false);
        // Refresco inmediato: el estado puede seguir asentandose en systemd.
        void refresh();
      }
    },
    [refresh, setPaused, showToast, updateService]
  );

  /** Punto de entrada desde los botones: confirma o ejecuta directamente. */
  const handleAction = useCallback(
    (service: ServiceStatus, action: ServiceAction) => {
      if (NEEDS_CONFIRMATION.includes(action)) {
        setPending({ service, action });
        return;
      }
      void runAction(service, action);
    },
    [runAction]
  );

  const confirmText =
    pending?.action === 'stop'
      ? {
          title: `¿Detener ${pending.service.name}?`,
          message: `El servicio dejara de responder en el servidor hasta que se inicie de nuevo. Se ejecutara "systemctl stop ${pending.service.name}" en el host.`,
          confirmLabel: 'Detener',
          tone: 'danger' as const,
        }
      : pending
        ? {
            title: `¿Reiniciar ${pending.service.name}?`,
            message: `El servicio se detendra y volvera a iniciarse; habra una breve interrupcion. Se ejecutara "systemctl restart ${pending.service.name}" en el host.`,
            confirmLabel: 'Reiniciar',
            tone: 'warning' as const,
          }
        : null;

  return (
    <div className="space-y-5">
      {/* Encabezado con el resumen y el sello de ultima actualizacion */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Servicios del sistema
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </span>{' '}
            de {services.length} servicios activos
          </p>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {lastUpdated
              ? `Actualizado ${formatTime(lastUpdated)}`
              : 'Consultando...'}
            <span className="ml-1 hidden sm:inline">· auto cada 5 s</span>
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busyService !== null}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 ring-inset transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Aviso de error cuando ya hay datos en pantalla (el error total se
          muestra dentro de la tabla). */}
      {error && services.length > 0 && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <ServiceTable
        services={services}
        isAdmin={isAdmin}
        loading={loading}
        error={error}
        busyService={busyService}
        onAction={handleAction}
      />

      {!isAdmin && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Su sesion es de <strong>solo lectura</strong>: puede consultar el estado
          de los servicios, pero no controlarlos.
        </p>
      )}

      {pending && confirmText && (
        <ConfirmModal
          open
          title={confirmText.title}
          message={confirmText.message}
          confirmLabel={confirmText.confirmLabel}
          tone={confirmText.tone}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const { service, action } = pending;
            setPending(null);
            void runAction(service, action);
          }}
        />
      )}
    </div>
  );
}
