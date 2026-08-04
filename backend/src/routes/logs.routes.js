/**
 * logs.routes.js — Bitacora de auditoria (solo admin).
 *
 * Devuelve quien hizo que y cuando. Es la evidencia de trazabilidad del
 * panel: cada login y cada start/stop/restart deja una fila aqui.
 */
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listAuditLogs, countAuditLogs } from '../db.js';

export const logsRouter = Router();

logsRouter.use(auth, requireAdmin);

/** Convierte un parametro de query a entero acotado (evita LIMIT gigantes). */
function toBoundedInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/* -------------------------------------------------------------------- */
/*  GET /api/logs?limit=50&offset=0                                      */
/* -------------------------------------------------------------------- */
logsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    // Paginacion acotada: limit maximo 200 para que un cliente no pueda pedir
    // toda la tabla de golpe y agotar la memoria del contenedor.
    const limit = toBoundedInt(req.query.limit, 50, 1, 200);
    const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    res.json({
      total: countAuditLogs(),
      logs: listAuditLogs(limit, offset),
    });
  })
);
