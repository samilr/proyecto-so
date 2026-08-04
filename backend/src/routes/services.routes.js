/**
 * services.routes.js — Consulta y control de los servicios systemd del host.
 *
 * Modelo de permisos:
 *   GET  (lectura)  -> cualquier usuario autenticado (admin o viewer)
 *   POST (control)  -> SOLO admin, porque modifica el estado real del sistema
 *                      operativo anfitrion.
 */
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateServiceName, validateAction, VALID_ACTIONS } from '../utils/validate.js';
import { listServices, getServiceStatus, controlService } from '../services/systemctl.js';
import { insertAuditLog } from '../db.js';

export const servicesRouter = Router();

// Todas las rutas de este router exigen JWT valido.
servicesRouter.use(auth);

/* -------------------------------------------------------------------- */
/*  GET /api/services — estado de toda la lista blanca                   */
/* -------------------------------------------------------------------- */
servicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const services = await listServices();
    res.json({ services });
  })
);

/* -------------------------------------------------------------------- */
/*  GET /api/services/:name — estado de un servicio concreto             */
/* -------------------------------------------------------------------- */
servicesRouter.get(
  '/:name',
  asyncHandler(async (req, res) => {
    // validateServiceName aplica regex + lista blanca y lanza AppError si algo
    // no cuadra (400 INVALID_SERVICE_NAME / 403 SERVICE_NOT_ALLOWED).
    const name = validateServiceName(req.params.name);
    const service = await getServiceStatus(name);
    res.json({ service });
  })
);

/* -------------------------------------------------------------------- */
/*  POST /api/services/:name/{start|stop|restart} — solo admin           */
/* -------------------------------------------------------------------- */
servicesRouter.post(
  `/:name/:action(${VALID_ACTIONS.join('|')})`,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = validateServiceName(req.params.name);
    const action = validateAction(req.params.action);

    try {
      const service = await controlService(name, action);

      // AUDITORIA: toda accion exitosa queda registrada con quien la hizo.
      insertAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action,
        service: name,
        success: true,
        detail: null,
      });

      res.json({
        action,
        service,
        executedAt: new Date().toISOString(),
      });
    } catch (err) {
      // AUDITORIA: los fallos tambien se registran (con el motivo), porque un
      // intento fallido es tan relevante para la trazabilidad como uno exitoso.
      insertAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action,
        service: name,
        success: false,
        detail: (err.message || 'Error desconocido').slice(0, 500),
      });
      throw err; // el errorHandler global lo convierte a SYSTEMCTL_ERROR
    }
  })
);
