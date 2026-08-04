/**
 * requireAdmin.js — Autorizacion por rol.
 *
 * Se monta SIEMPRE despues de `auth`: primero se comprueba quien eres
 * (autenticacion) y despues que puedas hacerlo (autorizacion).
 *
 * Regla del proyecto: leer estados es para cualquier usuario autenticado,
 * pero start/stop/restart (que modifican el estado real del host) y la
 * consulta de la bitacora quedan restringidos al rol admin.
 */
import { AppError } from './errorHandler.js';

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new AppError(401, 'UNAUTHORIZED', 'No autenticado.'));
  }
  if (req.user.role !== 'admin') {
    return next(
      new AppError(403, 'FORBIDDEN', 'Se requiere rol de administrador para esta operacion.')
    );
  }
  return next();
}
