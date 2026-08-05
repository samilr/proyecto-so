/**
 * index.js — Punto de entrada del backend.
 *
 * Este proceso es el PID 1 del contenedor. Eso tiene dos consecuencias
 * importantes que se manejan aqui abajo:
 *   1) `docker stop` envia SIGTERM al PID 1: hay que capturarlo y cerrar
 *      ordenadamente (dejar de aceptar conexiones + cerrar SQLite), o Docker
 *      lo matara con SIGKILL a los 10s dejando la base de datos a medias.
 *   2) Una excepcion no capturada tumba el contenedor entero; por eso hay
 *      manejadores de ultimo recurso al final del archivo.
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDb, closeDb, listManagedServiceNames } from './db.js';
import { authRouter } from './routes/auth.routes.js';
import { servicesRouter } from './routes/services.routes.js';
import { systemRouter } from './routes/system.routes.js';
import { logsRouter } from './routes/logs.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Crear el esquema y sembrar usuarios ANTES de aceptar trafico.
initDb();

const app = express();

// Detras del proxy Nginx del contenedor frontend, la IP del cliente llega en
// X-Forwarded-For. Sin esto, req.ip seria siempre la IP del contenedor Nginx
// y el rate limit del login se aplicaria a todos los usuarios como si fueran
// uno solo.
app.set('trust proxy', 1);

// Cabecera que delata la tecnologia del servidor: se desactiva.
app.disable('x-powered-by');

/**
 * CORS: solo en desarrollo el frontend (Vite en :5173) tiene un origen
 * distinto al del backend (:8000) y el navegador exige esta cabecera.
 * En produccion todo pasa por el mismo origen gracias al proxy de Nginx.
 */
app.use(
  cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Limite de tamano del body: ningun endpoint recibe mas que un login.
app.use(express.json({ limit: '32kb' }));

// Log minimo de acceso, util durante la demostracion (docker compose logs -f).
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

/* -------------------------------------------------------------------- */
/*  Rutas                                                                */
/* -------------------------------------------------------------------- */

// Sin autenticacion: la usa el HEALTHCHECK del Dockerfile y Compose.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/auth', authRouter);
app.use('/api/services', servicesRouter);
app.use('/api/system', systemRouter);
app.use('/api/logs', logsRouter);

// 404 y manejador global de errores SIEMPRE al final: Express recorre los
// middlewares en orden de registro.
app.use(notFoundHandler);
app.use(errorHandler);

/* -------------------------------------------------------------------- */
/*  Arranque                                                             */
/* -------------------------------------------------------------------- */

// 0.0.0.0 y no 127.0.0.1: dentro del contenedor hay que escuchar en todas las
// interfaces para que el puerto publicado por Docker sea alcanzable desde
// fuera del namespace de red.
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log('----------------------------------------------------------');
  console.log(`  Panel de Servicios Systemd — backend escuchando en :${config.port}`);
  console.log(`  Servicios administrados: ${listManagedServiceNames().join(', ') || '(ninguno)'}`);
  console.log(`  Base de datos: ${config.dbPath}`);
  console.log(`  CORS permitido para: ${config.corsOrigin}`);
  console.log('----------------------------------------------------------');
});

/* -------------------------------------------------------------------- */
/*  Cierre ordenado (graceful shutdown)                                  */
/* -------------------------------------------------------------------- */
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Cerrando el backend de forma ordenada...`);

  // Deja de aceptar conexiones nuevas y espera a que terminen las en curso.
  server.close(() => {
    closeDb();
    console.log('[shutdown] Listo.');
    process.exit(0);
  });

  // Red de seguridad: si alguna conexion se queda colgada, no esperamos a que
  // Docker nos mande SIGKILL; salimos por nuestra cuenta a los 8 segundos.
  setTimeout(() => {
    console.error('[shutdown] Tiempo agotado, forzando la salida.');
    closeDb();
    process.exit(1);
  }, 8000).unref();
}

// SIGTERM: lo envia `docker stop` / `docker compose down`.
// SIGINT: Ctrl+C cuando se ejecuta en primer plano.
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Ultimo recurso: registrar el fallo antes de morir, para que quede en
// `docker compose logs` y `restart: unless-stopped` levante el contenedor.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
