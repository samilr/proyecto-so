/**
 * system.routes.js — Metricas globales del servidor anfitrion.
 *
 * Requiere sesion pero NO rol admin: son datos de solo lectura, igual que el
 * estado de los servicios. Un `viewer` debe poder ver la salud del servidor.
 */
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getSystemInfo } from '../services/systeminfo.js';

export const systemRouter = Router();

systemRouter.use(auth);

/* -------------------------------------------------------------------- */
/*  GET /api/system                                                      */
/* -------------------------------------------------------------------- */
systemRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    // getSystemInfo es sincrono (solo lee /proc a traves del modulo os), pero
    // se mantiene dentro del asyncHandler para que cualquier fallo inesperado
    // termine igualmente en el manejador global de errores.
    res.json({ system: getSystemInfo() });
  })
);
