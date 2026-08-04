/**
 * App.tsx — Composicion de la aplicacion: proveedores globales + rutas.
 *
 * Orden de los proveedores (importa):
 *   BrowserRouter -> AuthProvider -> ToastProvider
 * AuthProvider queda dentro del Router porque sus consumidores usan hooks de
 * navegacion, y ToastProvider dentro de Auth para poder notificar eventos de
 * sesion si hiciera falta.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AuditLogPage } from './pages/AuditLogPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Publica */}
            <Route path="/login" element={<LoginPage />} />

            {/* Privadas: comparten el Layout (barra de navegacion) */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route
                path="/logs"
                element={
                  // requireAdmin: un viewer que escriba /logs a mano acaba
                  // redirigido al dashboard.
                  <ProtectedRoute requireAdmin>
                    <AuditLogPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Cualquier otra ruta vuelve al inicio. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
