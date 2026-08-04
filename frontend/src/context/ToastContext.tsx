/**
 * ToastContext.tsx — Notificaciones flotantes (exito / error / info).
 *
 * Se usa para dar realimentacion inmediata de las acciones sobre servicios:
 * "nginx reiniciado correctamente" o el mensaje de error que devuelve
 * systemctl. Es clave para la demostracion en vivo, porque el cambio de
 * estado del servicio puede tardar un segundo en reflejarse en la tabla.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToastList } from '../components/Toast';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  showToast: (variant: ToastVariant, message: string) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Tiempo en pantalla; los errores duran mas para poder leerlos. */
const DURATION_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Contador propio en vez de Date.now(): dos toasts disparados en el mismo
  // milisegundo tendrian la misma key de React y se pisarian.
  const nextId = useRef(1);
  // Se guardan los temporizadores para poder cancelarlos al desmontar y no
  // llamar a setState sobre un componente ya desmontado.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, variant, message }]);

      const timer = setTimeout(() => dismissToast(id), DURATION_MS[variant]);
      timers.current.set(id, timer);
    },
    [dismissToast]
  );

  // Limpieza al desmontar el provider.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
