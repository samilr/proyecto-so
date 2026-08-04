/**
 * validate.js — Validacion del parametro :name antes de tocar el sistema.
 *
 * Defensa en profundidad, en dos capas independientes:
 *   1) Forma: el nombre debe encajar en un regex estricto de nombres de unidad
 *      systemd. Esto corta de raiz cualquier intento de inyeccion (`;`, `|`,
 *      `$(...)`, `../`, espacios, saltos de linea...).
 *   2) Autorizacion: el nombre debe estar en la lista blanca dinamica SQLite.
 *
 * Aunque usamos execFile con array de argumentos (que ya evita el shell y por
 * tanto la inyeccion de comandos), validar la forma sigue siendo necesario:
 * sin ella un usuario podria pasar cualquier unidad del host como argumento
 * legitimo de systemctl.
 */
import { normalizeServiceName } from '../config.js';
import { isManagedService } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

// Caracteres permitidos en una unidad systemd: minusculas, digitos, y los
// separadores @ (unidades instanciadas, ej. getty@tty1), guion, punto y _.
const SERVICE_NAME_REGEX = /^[a-z0-9@\-\._]+$/;

/**
 * Valida solo la forma para poder comprobar una unidad antes de agregarla.
 * @throws {AppError} 400 INVALID_SERVICE_NAME | 403 SERVICE_NOT_ALLOWED
 */
export function validateServiceNameFormat(rawName) {
  const name = normalizeServiceName(rawName);

  if (!name || name.length > 64 || !SERVICE_NAME_REGEX.test(name)) {
    throw new AppError(
      400,
      'INVALID_SERVICE_NAME',
      `El nombre de servicio "${rawName}" no es valido. Solo se permiten letras minusculas, digitos y los caracteres @ - . _`
    );
  }

  return name;
}

/** Valida forma + pertenencia a la lista blanca dinamica. */
export function validateServiceName(rawName) {
  const name = validateServiceNameFormat(rawName);

  if (!isManagedService(name)) {
    throw new AppError(
      403,
      'SERVICE_NOT_ALLOWED',
      `El servicio "${name}" no esta en la lista blanca de servicios administrables.`
    );
  }

  return name;
}

/** Acciones de control permitidas. Cualquier otra cosa se rechaza. */
export const VALID_ACTIONS = ['start', 'stop', 'restart'];

export function validateAction(action) {
  if (!VALID_ACTIONS.includes(action)) {
    throw new AppError(
      404,
      'NOT_FOUND',
      `Accion "${action}" no soportada. Use: ${VALID_ACTIONS.join(', ')}.`
    );
  }
  return action;
}
