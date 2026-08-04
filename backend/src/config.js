/**
 * config.js — Carga y validacion de la configuracion del proceso.
 *
 * Toda la configuracion entra por variables de entorno (12-factor app):
 * asi la MISMA imagen Docker sirve para desarrollo y produccion, cambiando
 * solo el env_file. Ningun secreto queda escrito en el codigo ni en la imagen.
 */
import 'dotenv/config';

/**
 * Normaliza el nombre de una unidad de systemd.
 * systemd trata "nginx" y "nginx.service" como la misma unidad; para poder
 * comparar contra la lista blanca de forma fiable eliminamos el sufijo y
 * trabajamos siempre con el nombre "corto".
 */
export function normalizeServiceName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\.service$/, '');
}

/**
 * SEGURIDAD (fail-fast): sin JWT_SECRET no se puede firmar ni verificar
 * ningun token. Arrancar con un secreto por defecto seria peor que no
 * arrancar, porque daria una falsa sensacion de seguridad: cualquiera que
 * conozca el default podria fabricar un token de admin. Por eso el proceso
 * muere aqui mismo con un mensaje explicito.
 */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.trim() === '') {
  console.error(
    '\n[FATAL] Falta la variable de entorno JWT_SECRET.\n' +
      '        El backend no puede arrancar sin un secreto para firmar los JWT.\n' +
      '        Solucion: copia backend/.env.example a backend/.env y define\n' +
      '        JWT_SECRET (por ejemplo: openssl rand -hex 32).\n'
  );
  process.exit(1);
}

// Lista blanca: se parsea una sola vez al arrancar. Los nombres vacios se
// descartan para tolerar comas sobrantes en el .env (ej: "nginx,ssh,").
const ALLOWED_SERVICES = (process.env.ALLOWED_SERVICES || '')
  .split(',')
  .map(normalizeServiceName)
  .filter(Boolean);

if (ALLOWED_SERVICES.length === 0) {
  console.warn(
    '[WARN] ALLOWED_SERVICES esta vacia: el panel no expondra ningun servicio.'
  );
}

export const config = {
  port: Number(process.env.PORT) || 8000,
  jwtSecret: JWT_SECRET,
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  allowedServices: ALLOWED_SERVICES,
  dbPath: process.env.DB_PATH || '/data/panel.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Timeout duro para cada invocacion de systemctl (ms). Evita que una unidad
  // colgada bloquee un worker de Node indefinidamente.
  execTimeoutMs: 10_000,
};

/** true si el servicio (normalizado) esta en la lista blanca. */
export function isServiceAllowed(name) {
  return config.allowedServices.includes(normalizeServiceName(name));
}
