/**
 * auth.routes.js — Inicio de sesion y emision de JWT.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { findUserByUsername, insertAuditLog } from '../db.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

export const authRouter = Router();

/* -------------------------------------------------------------------- */
/*  Rate limit en memoria para /login                                    */
/* -------------------------------------------------------------------- */
/**
 * SEGURIDAD: sin limite de intentos, un atacante puede probar miles de
 * contrasenas por minuto contra /api/auth/login. Aqui limitamos a 5 intentos
 * por IP por minuto usando una ventana fija guardada en un Map.
 *
 * Se implementa a mano (sin dependencias) y en memoria porque:
 *  - hay un solo contenedor de backend, no necesitamos estado compartido;
 *  - al reiniciar el contenedor el contador se pierde, lo cual es aceptable
 *    para el alcance academico del proyecto.
 * En produccion real con varias replicas esto viviria en Redis.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map(); // ip -> { count, resetAt }

// Limpieza periodica: sin esto el Map creceria sin limite (fuga de memoria)
// con cada IP que haya intentado entrar alguna vez.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(ip);
  }
}, WINDOW_MS);
// unref: este temporizador no debe impedir que el proceso termine (SIGTERM).
cleanupTimer.unref();

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'desconocida';
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    const secondsLeft = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(secondsLeft));
    return next(
      new AppError(
        429,
        'RATE_LIMITED',
        `Demasiados intentos de inicio de sesion. Intente nuevamente en ${secondsLeft} segundos.`
      )
    );
  }
  return next();
}

/* -------------------------------------------------------------------- */
/*  POST /api/auth/login                                                 */
/* -------------------------------------------------------------------- */
authRouter.post(
  '/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Usuario y contrasena son obligatorios.');
    }

    const user = findUserByUsername(username);

    // SEGURIDAD: si el usuario no existe igualmente se ejecuta una comparacion
    // bcrypt contra un hash ficticio. Asi el tiempo de respuesta es parecido en
    // ambos casos y no se filtra por temporizacion que usuarios existen.
    // (hash "senuelo" con formato bcrypt valido y coste 10; ninguna contrasena
    // real coincidira con el, pero cuesta lo mismo de verificar.)
    const hash = user
      ? user.password_hash
      : '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const passwordOk = bcrypt.compareSync(password, hash);

    if (!user || !passwordOk) {
      // Se audita el intento fallido; no se guarda la contrasena, obviamente.
      insertAuditLog({
        userId: null,
        username: String(username).slice(0, 64),
        action: 'login',
        service: null,
        success: false,
        detail: 'Credenciales invalidas',
      });
      // Mensaje deliberadamente generico: no se revela si fallo el usuario o
      // la contrasena (evita la enumeracion de cuentas).
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Usuario o contrasena incorrectos.');
    }

    // El payload del token solo lleva datos NO sensibles. Va firmado, no
    // cifrado: cualquiera puede leerlo, pero nadie puede alterarlo sin el
    // JWT_SECRET.
    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpires }
    );

    insertAuditLog({
      userId: user.id,
      username: user.username,
      action: 'login',
      service: null,
      success: true,
      detail: null,
    });

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  })
);
