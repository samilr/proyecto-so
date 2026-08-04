/**
 * auth.js — Autenticacion por JWT (Bearer token).
 *
 * El backend es sin estado (stateless): no guarda sesiones en memoria ni en
 * la base de datos. Toda la identidad viaja firmada dentro del token, lo que
 * permite reiniciar o replicar el contenedor sin invalidar los logins.
 */
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from './errorHandler.js';

export function auth(req, res, next) {
  const header = req.headers.authorization || '';

  // Se exige el esquema "Bearer <token>" (RFC 6750).
  if (!header.startsWith('Bearer ')) {
    return next(
      new AppError(401, 'UNAUTHORIZED', 'Falta el token de autenticacion (header Authorization: Bearer <token>).')
    );
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    // verify() comprueba la firma HMAC y la expiracion (exp) del token.
    // Si el token fue manipulado o caduco, lanza y respondemos 401.
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'La sesion ha expirado, vuelva a iniciar sesion.'
        : 'Token invalido.';
    return next(new AppError(401, 'UNAUTHORIZED', message));
  }
}
