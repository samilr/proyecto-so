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
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  validateServiceName,
  validateServiceNameFormat,
  validateAction,
  VALID_ACTIONS,
} from '../utils/validate.js';
import {
  listServices,
  getServiceStatus,
  getServiceDetails,
  controlService,
} from '../services/systemctl.js';
import {
  insertAuditLog,
  listServiceAuditLogs,
  isManagedService,
  addManagedService,
  removeManagedService,
} from '../db.js';

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
/*  POST /api/services — agregar una unidad existente (solo admin)       */
/* -------------------------------------------------------------------- */
servicesRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = validateServiceNameFormat(req.body?.name);

    if (isManagedService(name)) {
      throw new AppError(
        409,
        'SERVICE_ALREADY_MANAGED',
        `El servicio "${name}" ya aparece en el panel.`
      );
    }

    const service = await getServiceStatus(name);
    if (service.loadState === 'not-found') {
      throw new AppError(
        404,
        'SERVICE_NOT_INSTALLED',
        `systemd no encontro ${name}.service. Instale el servicio antes de agregarlo.`
      );
    }
    if (service.loadState === 'masked') {
      throw new AppError(
        409,
        'SERVICE_UNAVAILABLE',
        `El servicio "${name}" esta enmascarado en systemd y no puede controlarse.`
      );
    }
    if (service.loadState !== 'loaded') {
      throw new AppError(
        503,
        'SYSTEMCTL_ERROR',
        `No se pudo validar "${name}" contra systemd. Intente nuevamente.`
      );
    }

    addManagedService(name, req.user.username);
    insertAuditLog({
      userId: req.user.id,
      username: req.user.username,
      action: 'add_service',
      service: name,
      success: true,
      detail: 'Servicio agregado a la lista blanca dinamica.',
    });

    res.status(201).json({ service, addedAt: new Date().toISOString() });
  })
);

/* -------------------------------------------------------------------- */
/*  GET /api/services/:name/details — acordeon tecnico + comandos        */
/* -------------------------------------------------------------------- */
servicesRouter.get(
  '/:name/details',
  asyncHandler(async (req, res) => {
    const name = validateServiceName(req.params.name);
    const details = await getServiceDetails(name);
    // El historial contiene nombres de usuario y por tanto conserva la misma
    // restriccion que la bitacora general. Un viewer puede inspeccionar los
    // metadatos tecnicos, pero no la actividad de otros usuarios.
    const canViewCommands = req.user.role === 'admin';
    const commands = canViewCommands ? listServiceAuditLogs(name, 20) : [];
    res.json({ ...details, canViewCommands, commands });
  })
);

/* -------------------------------------------------------------------- */
/*  DELETE /api/services/:name — quitar del panel, no del host           */
/* -------------------------------------------------------------------- */
servicesRouter.delete(
  '/:name',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = validateServiceName(req.params.name);
    removeManagedService(name);

    insertAuditLog({
      userId: req.user.id,
      username: req.user.username,
      action: 'remove_service',
      service: name,
      success: true,
      detail: 'Servicio quitado del panel; no fue detenido ni desinstalado.',
    });

    res.json({ removed: name, removedAt: new Date().toISOString() });
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
        command: `systemctl ${action} ${name}`,
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
