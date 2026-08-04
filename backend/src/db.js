/**
 * db.js — Persistencia con SQLite (better-sqlite3).
 *
 * Por que SQLite y no un motor cliente/servidor: el panel guarda muy poco
 * (usuarios y bitacora) y necesita cero administracion. better-sqlite3 es
 * SINCRONO: no devuelve promesas. Esto es deliberado y seguro aqui porque
 * las consultas son de microsegundos sobre un archivo local; usar el driver
 * asincrono solo anadiria complejidad sin ganancia real.
 *
 * CONTENERIZACION: el archivo vive en DB_PATH (=/data/panel.db), que es un
 * volumen nombrado de Docker. La capa de escritura del contenedor es efimera
 * — se destruye al hacer `docker compose down` — mientras que el volumen es
 * gestionado por el daemon fuera del contenedor, asi que los usuarios y la
 * auditoria sobreviven a reconstrucciones de la imagen.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

// El volumen puede montarse vacio: nos aseguramos de que exista el directorio
// contenedor del archivo antes de abrirlo, o SQLite fallaria con SQLITE_CANTOPEN.
const dir = path.dirname(config.dbPath);
fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbPath);

// WAL (Write-Ahead Logging): permite lecturas concurrentes mientras se
// escribe. Con el polling del frontend cada 5s vale la pena.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Crea el esquema si no existe (idempotente en cada arranque). */
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('admin','viewer'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER,
      username  TEXT NOT NULL,
      action    TEXT NOT NULL,
      service   TEXT,
      success   INTEGER NOT NULL,
      detail    TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- La bitacora se consulta siempre ordenada por fecha descendente.
    CREATE INDEX IF NOT EXISTS idx_audit_log_id_desc ON audit_log (id DESC);
  `);
}

/**
 * Seed idempotente: solo inserta si la tabla de usuarios esta vacia.
 * De este modo, si el administrador cambia las contrasenas mas adelante, un
 * reinicio del contenedor NO las vuelve a poner en su valor por defecto.
 */
function seedUsers() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  if (total > 0) return;

  // bcrypt con coste 10: hash lento a proposito para encarecer los ataques de
  // fuerza bruta si la base de datos se filtrara. NUNCA se guarda la clave.
  const insert = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  );
  const seed = db.transaction((users) => {
    for (const u of users) {
      insert.run(u.username, bcrypt.hashSync(u.password, 10), u.role);
    }
  });

  seed([
    { username: 'admin', password: 'Admin2026!', role: 'admin' },
    { username: 'viewer', password: 'Viewer2026!', role: 'viewer' },
  ]);

  console.log('[db] Usuarios iniciales creados: admin (admin) / viewer (viewer).');
}

export function initDb() {
  createSchema();
  seedUsers();
  console.log(`[db] SQLite listo en ${config.dbPath}`);
}

/* ------------------------------------------------------------------ */
/*  Consultas (sentencias preparadas => inmunes a inyeccion de SQL)    */
/* ------------------------------------------------------------------ */

export function findUserByUsername(username) {
  return db
    .prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?')
    .get(username);
}

/**
 * Registra una entrada en la bitacora de auditoria.
 * Se llama en TODA accion sensible (login, start, stop, restart), tanto si
 * tuvo exito como si fallo: la trazabilidad es un requisito del proyecto.
 */
export function insertAuditLog({ userId = null, username, action, service = null, success, detail = null }) {
  return db
    .prepare(
      `INSERT INTO audit_log (user_id, username, action, service, success, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, username, action, service, success ? 1 : 0, detail);
}

/** Normaliza el timestamp de SQLite ("YYYY-MM-DD HH:MM:SS" en UTC) a ISO-8601. */
function toIso(value) {
  if (!value) return null;
  // Si ya viene en ISO se respeta; si viene en formato SQLite se le anade la
  // T y la Z para que Date lo interprete como UTC (y no como hora local).
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function countAuditLogs() {
  return db.prepare('SELECT COUNT(*) AS total FROM audit_log').get().total;
}

export function listAuditLogs(limit, offset) {
  return db
    .prepare(
      `SELECT id, username, action, service, success, detail, timestamp
       FROM audit_log
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
    .map((row) => ({
      id: row.id,
      username: row.username,
      action: row.action,
      service: row.service ?? null,
      // SQLite no tiene BOOLEAN: se guarda 0/1 y se convierte aqui para
      // cumplir el contrato de la API (success: true | false).
      success: row.success === 1,
      detail: row.detail ?? null,
      timestamp: toIso(row.timestamp),
    }));
}

/** Cierre ordenado del archivo SQLite durante el graceful shutdown. */
export function closeDb() {
  try {
    db.close();
    console.log('[db] Conexion SQLite cerrada.');
  } catch (err) {
    console.error('[db] Error al cerrar SQLite:', err.message);
  }
}
