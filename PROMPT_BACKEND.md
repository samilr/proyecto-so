# PROMPT — BACKEND: Panel Web de Control de Servicios Systemd (Dockerizado)

> Copia todo el contenido de este bloque como prompt para generar el backend completo.

---

Actúa como un Ingeniero Senior Backend con experiencia en Node.js, Express, Linux, systemd y Docker.

Genera el **backend completo y contenerizado** de un "Panel Web de Control de Servicios Systemd" para un proyecto universitario de Sistemas Operativos. La app corre como contenedor Docker en un host Ubuntu Server 22.04+ y administra **servicios reales del sistema operativo anfitrión** vía `systemctl`.

## STACK OBLIGATORIO

- Node.js 20+ con Express 4
- JavaScript (ES Modules, no TypeScript)
- `better-sqlite3` para persistencia (usuarios y log de auditoría)
- `jsonwebtoken` para JWT, `bcryptjs` para hash de contraseñas
- `child_process.execFile` (**NUNCA** `exec`, para prevenir inyección de comandos)
- `dotenv` para configuración
- CORS habilitado para el origen del frontend (variable `CORS_ORIGIN`, default `http://localhost:5173`)
- **Docker + Docker Compose** para el despliegue completo

## ARQUITECTURA DE CONTENERIZACIÓN (CRÍTICO)

El contenedor está aislado por namespaces del kernel, por lo que **no puede ver el systemd del host por defecto**. Para controlarlo, el contenedor se comunica con el systemd del anfitrión a través de su socket D-Bus:

1. El contenedor monta como volúmenes de solo lectura funcional:
   - `/run/systemd:/run/systemd` (sockets de control de systemd del host)
   - `/var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket` (bus del sistema)
2. La imagen se basa en `node:20-bookworm-slim` (Debian) e instala el paquete `systemd` **solo para obtener el binario cliente `systemctl`** — el contenedor NO ejecuta systemd como init; su proceso principal (PID 1) es Node.js.
3. El contenedor corre con `cap_add: [SYS_ADMIN]` y usuario root interno. Al hablar con el D-Bus del host como root, polkit del anfitrión autoriza las acciones sin necesidad de `sudo` → dentro del contenedor se ejecuta `systemctl <action> <name>` directamente (sin sudo).
4. La base de datos SQLite persiste en un volumen nombrado `panel-data` montado en `/data` (variable `DB_PATH=/data/panel.db`).
5. Documentar en el README y en comentarios: qué es un namespace, por qué el aislamiento impide ver procesos del host, y cómo el montaje del socket D-Bus "perfora" ese aislamiento de forma controlada (justificación académica para la materia de Sistemas Operativos).

## ESTRUCTURA DEL PROYECTO

```
backend/
├── src/
│   ├── index.js              # Entry point, arranque Express, graceful shutdown (SIGTERM para Docker)
│   ├── config.js             # Lee .env: PORT=8000, JWT_SECRET, JWT_EXPIRES=8h, ALLOWED_SERVICES, DB_PATH, CORS_ORIGIN
│   ├── db.js                 # Init SQLite en DB_PATH: tablas users y audit_log, seed idempotente de usuarios
│   ├── middleware/
│   │   ├── auth.js           # Verifica JWT, adjunta req.user = {id, username, role}
│   │   ├── requireAdmin.js   # 403 si req.user.role !== 'admin'
│   │   └── errorHandler.js   # Middleware global de errores → formato de error unificado
│   ├── services/
│   │   └── systemctl.js      # Toda la interacción con systemd (detallado abajo)
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── services.routes.js
│   │   └── logs.routes.js
│   └── utils/
│       └── validate.js       # Validación de nombre de servicio
├── Dockerfile
├── .dockerignore
├── .env.example
├── package.json
└── README.md
```

En la **raíz del repositorio** (fuera de `backend/`) genera también:

```
docker-compose.yml            # Orquesta backend + frontend (el frontend se define en su propio prompt)
```

## DOCKERFILE (requisitos)

- Base: `node:20-bookworm-slim`
- `apt-get install -y --no-install-recommends systemd` (solo por el binario `systemctl`) + limpieza de cachés apt en la misma capa
- Multi-stage no es necesario (no hay build), pero sí: copiar `package*.json` primero, `npm ci --omit=dev`, luego copiar `src/` (aprovechar caché de capas)
- `ENV NODE_ENV=production`
- `EXPOSE 8000`
- `HEALTHCHECK` cada 30s contra `http://localhost:8000/api/health` usando node (sin curl)
- `CMD ["node", "src/index.js"]`

## DOCKER-COMPOSE (servicio backend)

```yaml
services:
  backend:
    build: ./backend
    container_name: panel-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file: ./backend/.env
    environment:
      - DB_PATH=/data/panel.db
    volumes:
      - /run/systemd:/run/systemd
      - /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket
      - panel-data:/data
    cap_add:
      - SYS_ADMIN

volumes:
  panel-data:
```

(El servicio `frontend` se agrega desde el prompt del frontend; deja el archivo preparado con comentario indicándolo.)

## SEGURIDAD (CRÍTICO)

1. **Lista blanca:** `ALLOWED_SERVICES` en `.env`, ej: `nginx,mysql,ssh,cron`. Cualquier servicio fuera de la lista → 403 con code `SERVICE_NOT_ALLOWED`.
2. **Validación regex** del parámetro `name`: `/^[a-z0-9@\-\._]+$/` → si falla, 400 `INVALID_SERVICE_NAME`.
3. Usar **siempre** `execFile('systemctl', [action, serviceName])` con array de argumentos. Nunca interpolar strings en un shell. (Dentro del contenedor no se usa `sudo`: el proceso corre como root y habla con el D-Bus del host.)
4. Acciones `start/stop/restart` requieren rol `admin`. Los GET de estados solo requieren JWT válido.
5. Timeout de 10 segundos en cada `execFile`.
6. Rate limit simple en `/api/auth/login`: máximo 5 intentos por IP por minuto (en memoria).
7. `JWT_SECRET` obligatorio desde `.env`; si falta, la app no arranca (fail-fast con mensaje claro).

## MÓDULO systemctl.js

- `getServiceStatus(name)`: ejecuta `systemctl show <name> --property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,MemoryCurrent,Description --no-pager`, parsea la salida clave=valor y retorna el objeto `ServiceStatus` (contrato abajo). Calcula `uptimeSeconds` desde `ExecMainStartTimestamp` si el servicio está activo. `MemoryCurrent` con valor `[not set]` o `18446744073709551615` → `null`.
- `listServices()`: `Promise.all` sobre la lista blanca con `getServiceStatus`.
- `controlService(name, action)`: `action ∈ {start, stop, restart}`. Ejecuta `systemctl <action> <name>`, luego consulta el nuevo estado y lo retorna. Si systemctl falla, lanza error con el stderr capturado.

## CONTRATOS DE DATOS (respetar EXACTAMENTE)

### Formato de error global (todas las respuestas de error)

```json
{ "error": { "code": "STRING_CODE", "message": "Descripción legible" } }
```

Códigos: `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`, `SERVICE_NOT_ALLOWED`, `INVALID_SERVICE_NAME`, `SYSTEMCTL_ERROR`, `RATE_LIMITED`, `NOT_FOUND`, `INTERNAL_ERROR`

### POST /api/auth/login

```json
// Request
{ "username": "string", "password": "string" }

// Response 200
{
  "token": "jwt-string",
  "user": { "id": 1, "username": "admin", "role": "admin" }
}
// role: "admin" | "viewer"
// Response 401: error INVALID_CREDENTIALS
```

### GET /api/services  (auth: cualquier rol)

```json
// Response 200
{ "services": [ ServiceStatus ] }
```

```json
// ServiceStatus
{
  "name": "nginx",
  "description": "A high performance web server",
  "status": "active",
  "subState": "running",
  "pid": 1234,
  "uptimeSeconds": 7530,
  "memoryBytes": 12582912
}
// status: "active" | "inactive" | "failed" | "activating" | "deactivating" | "unknown"
// pid, uptimeSeconds, memoryBytes: number | null
```

### GET /api/services/:name  (auth: cualquier rol)

```json
// Response 200
{ "service": ServiceStatus }
// Response 403: SERVICE_NOT_ALLOWED | Response 400: INVALID_SERVICE_NAME
```

### POST /api/services/:name/start | /stop | /restart  (auth: solo admin)

```json
// Request body: vacío

// Response 200
{
  "action": "restart",
  "service": ServiceStatus,
  "executedAt": "2026-08-04T14:30:00.000Z"
}
// "service" refleja el estado DESPUÉS de la acción.
// Response 500 si systemctl falla: SYSTEMCTL_ERROR con stderr en message.
// Toda acción (exitosa o fallida) se inserta en audit_log.
```

### GET /api/logs?limit=50&offset=0  (auth: solo admin)

```json
// Response 200
{
  "total": 123,
  "logs": [
    {
      "id": 1,
      "username": "admin",
      "action": "restart",
      "service": "nginx",
      "success": true,
      "detail": null,
      "timestamp": "2026-08-04T14:30:00.000Z"
    }
  ]
}
// action: "start" | "stop" | "restart" | "login"
// service y detail: string | null
```

### GET /api/health  (sin auth)

```json
{ "status": "ok", "uptime": 123.45 }
```

## BASE DE DATOS (SQLite, archivo en DB_PATH)

```sql
users:     id INTEGER PK, username TEXT UNIQUE, password_hash TEXT,
           role TEXT CHECK(role IN ('admin','viewer'))
audit_log: id INTEGER PK, user_id INTEGER, username TEXT, action TEXT,
           service TEXT NULL, success INTEGER, detail TEXT NULL,
           timestamp TEXT DEFAULT (datetime('now'))
```

Seed inicial idempotente (solo si la tabla está vacía): `admin/Admin2026!` (rol admin) y `viewer/Viewer2026!` (rol viewer), hasheados con bcrypt.

## ENTREGABLES

- Código completo de todos los archivos, funcional, con manejo de errores en cada capa.
- `Dockerfile`, `.dockerignore`, `docker-compose.yml` (con el servicio backend completo y placeholder comentado para el frontend).
- `README.md` con:
  - Requisitos (Docker + Docker Compose en Ubuntu host).
  - Instalación paso a paso: clonar, configurar `.env`, `docker compose up -d --build`.
  - Explicación académica de la contenerización: namespaces, aislamiento, montaje del socket D-Bus y por qué el contenedor puede controlar el systemd del host.
  - Tabla de todos los endpoints con ejemplos `curl`.
  - Comandos útiles: `docker compose logs -f backend`, `docker compose restart backend`, inspección del volumen `panel-data`.
- Comentarios en español explicando las decisiones de seguridad y de contenerización (es para defensa académica).
