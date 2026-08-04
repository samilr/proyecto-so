/**
 * errorHandler.js — Contrato unico de errores de toda la API.
 *
 * TODA respuesta de error del backend tiene exactamente esta forma:
 *   { "error": { "code": "STRING_CODE", "message": "Descripcion legible" } }
 *
 * Centralizarlo en un solo middleware evita que cada ruta invente su propio
 * formato y permite que el frontend tenga un unico parser de errores.
 */

/** Codigos de error del contrato publico de la API. */
export const ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'SERVICE_NOT_ALLOWED',
  'INVALID_SERVICE_NAME',
  'SYSTEMCTL_ERROR',
  'RATE_LIMITED',
  'NOT_FOUND',
  'INTERNAL_ERROR',
];

/**
 * Error de aplicacion: lleva consigo el status HTTP y el code del contrato.
 * Cualquier capa puede lanzarlo (`throw new AppError(403, 'FORBIDDEN', '...')`)
 * y el middleware final lo traduce a la respuesta JSON correcta.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Envoltorio para handlers async.
 * Express 4 NO captura las promesas rechazadas de un handler asincrono: si no
 * se enganchan aqui, el error se perderia y la peticion quedaria colgada hasta
 * el timeout del cliente. Con esto, cualquier `throw` dentro de un handler
 * async termina en el errorHandler global.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 404 para cualquier ruta no registrada (se monta antes del errorHandler). */
export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/**
 * Middleware global de errores. Express lo identifica por tener 4 argumentos,
 * asi que la firma debe conservar `next` aunque no se use.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.status : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';

  // SEGURIDAD: los errores inesperados (bugs, fallos de SQLite, etc.) NO se
  // devuelven al cliente tal cual, porque su mensaje puede filtrar rutas
  // internas o detalles del sistema. Se registran completos en el log del
  // contenedor y al cliente le llega un mensaje generico.
  const message = isAppError ? err.message : 'Error interno del servidor.';

  if (!isAppError) {
    console.error('[ERROR NO CONTROLADO]', req.method, req.originalUrl, err);
  } else if (status >= 500) {
    console.error(`[${code}]`, req.method, req.originalUrl, err.message);
  }

  res.status(status).json({ error: { code, message } });
}
