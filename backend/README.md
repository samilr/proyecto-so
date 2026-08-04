# Backend — Panel Web de Control de Servicios Systemd

API REST en Node.js + Express que permite consultar y controlar **servicios reales de systemd del host Ubuntu**, desde un contenedor Docker.

Proyecto final de la asignatura de **Sistemas Operativos**.

---

## 1. Requisitos

| Requisito | Versión mínima | Nota |
|---|---|---|
| Host | Ubuntu Server 22.04+ | Cualquier distro con systemd sirve |
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 (plugin) | `docker compose version` |
| Permisos | root o miembro del grupo `docker` | Necesario para montar los sockets del host |

> El backend **no funciona en macOS ni en Windows**: no existe `systemd`. Ahí se puede levantar igualmente para probar la API (login, roles, auditoría, validaciones), pero todos los servicios reportarán `status: "unknown"`.

---

## 2. Instalación paso a paso

```bash
# 1. Clonar el repositorio en el host Ubuntu
git clone <url-del-repo> proyecto-final-so
cd proyecto-final-so

# 2. Configurar las variables de entorno del backend
cp backend/.env.example backend/.env

# 3. Generar un JWT_SECRET real y pegarlo en backend/.env
openssl rand -hex 32

# 4. Editar backend/.env: JWT_SECRET y ALLOWED_SERVICES
nano backend/.env

# 5. Construir y levantar
docker compose up -d --build

# 6. Verificar
curl http://localhost:8000/api/health
# -> {"status":"ok","uptime":3.12}
```

### Variables de entorno (`backend/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `8000` | Puerto de escucha dentro del contenedor |
| `JWT_SECRET` | — | **Obligatoria.** Sin ella el proceso no arranca (fail-fast) |
| `JWT_EXPIRES` | `8h` | Vigencia del token |
| `ALLOWED_SERVICES` | `nginx,mysql,ssh,cron` | Lista blanca separada por comas |
| `DB_PATH` | `/data/panel.db` | Archivo SQLite (dentro del volumen `panel-data`) |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen permitido (Vite en desarrollo) |

### Usuarios iniciales (seed idempotente)

| Usuario | Contraseña | Rol | Puede |
|---|---|---|---|
| `admin` | `Admin2026!` | `admin` | Ver estados, start/stop/restart, ver bitácora |
| `viewer` | `Viewer2026!` | `viewer` | Solo ver estados |

Solo se crean **si la tabla `users` está vacía**: si luego se cambian las contraseñas, un reinicio del contenedor no las revierte.

---

## 3. Explicación académica: ¿cómo controla el contenedor al systemd del host?

Esta es la parte central del proyecto para la materia.

### 3.1 ¿Qué es un namespace?

Un **namespace** es un mecanismo del kernel de Linux que le da a un grupo de procesos su **propia vista aislada** de un recurso global del sistema. El kernel es uno solo, pero cada namespace hace que sus procesos "vean" una copia independiente:

| Namespace | Qué aísla | Efecto dentro del contenedor |
|---|---|---|
| **PID** | Árbol de procesos | El contenedor tiene su propio PID 1 y no ve los procesos del host |
| **Mount (mnt)** | Puntos de montaje | Tiene su propio árbol de directorios (su propio `/`) |
| **Network (net)** | Interfaces, puertos, rutas | Su propia IP y sus propios puertos |
| **IPC** | Colas, semáforos, memoria compartida | No comparte IPC con el host |
| **UTS** | Hostname | Su propio nombre de máquina |
| **User** | Mapeo de UID/GID | Su propio root (según configuración) |

Un contenedor Docker **no es una máquina virtual**: es un proceso normal del host ejecutándose dentro de un conjunto de namespaces + cgroups (que limitan CPU/memoria) + capabilities (que reparten los privilegios de root).

### 3.2 ¿Por qué el aislamiento impide ver los servicios del host?

`systemd` es el **PID 1 del host**. Nuestro contenedor vive en:

- un **namespace PID propio** → `ps aux` dentro del contenedor solo muestra `node` y sus hijos; el PID 1 que ve es Node, no systemd;
- un **namespace de montaje propio** → su `/` es la imagen `node:20-bookworm-slim`, no el sistema de archivos de Ubuntu.

Por eso, sin configuración adicional, un `systemctl status nginx` dentro del contenedor fallaría: no hay ningún systemd al que preguntarle.

### 3.3 Cómo se "perfora" el aislamiento de forma controlada

La clave es que **`systemctl` no manipula procesos directamente**. `systemctl` es solo un **cliente**: traduce lo que uno escribe en llamadas al método `StartUnit` / `StopUnit` / `RestartUnit` de la interfaz `org.freedesktop.systemd1.Manager`, y las envía por **D-Bus** a través de un **socket UNIX**.

Un socket UNIX es un **archivo especial** del sistema de archivos. Y los archivos sí se pueden compartir entre namespaces de montaje mediante un **bind mount**:

```yaml
volumes:
  - /run/systemd:/run/systemd
  - /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket
```

Con esos dos montajes, el namespace de montaje del contenedor incluye los sockets **del host**. Entonces:

1. Node ejecuta `execFile('systemctl', ['restart', 'nginx'])`.
2. El `systemctl` de la imagen (instalado solo por el binario cliente) abre `/var/run/dbus/system_bus_socket`, que **es el socket del host**.
3. El mensaje D-Bus llega al **systemd del host (PID 1)**.
4. **El host** ejecuta el reinicio de nginx, con sus propios procesos y su propio namespace PID.
5. La respuesta vuelve por el mismo socket y `systemctl` sale con código 0.

Es la misma idea que montar `/var/run/docker.sock` para controlar Docker desde dentro de un contenedor: no se elimina el aislamiento, se abre **un único canal explícito** hacia un servicio del host.

### 3.4 ¿Por qué `cap_add: SYS_ADMIN` y root, y por qué no `sudo`?

- Linux divide los privilegios de root en **capabilities** (permisos atómicos). Docker por defecto quita la mayoría. `CAP_SYS_ADMIN` es la que habilita las operaciones administrativas necesarias para que este canal funcione. Se concede **solo esa**, en lugar de `--privileged`, que las daría todas y anularía buena parte del aislamiento.
- El proceso corre como **root dentro del contenedor**. Cuando se conecta al D-Bus del sistema, **polkit** del host ve un cliente con UID 0 y autoriza `StartUnit`/`StopUnit`/`RestartUnit` sin pedir contraseña.
- Por eso **no se usa `sudo`** dentro del contenedor: ya se es root, y `sudo` requeriría un TTY o una configuración de `sudoers` que no aporta nada aquí.

### 3.5 El contenedor NO ejecuta systemd

La imagen instala el paquete `systemd` de Debian, pero **solo para obtener el binario cliente `systemctl`**. El `CMD` de la imagen es `node src/index.js`, así que:

- **PID 1 del contenedor = Node**, no systemd;
- el contenedor no arranca units, no tiene journal propio, no gestiona nada;
- consecuencia práctica: Node recibe el `SIGTERM` de `docker stop`, y por eso `src/index.js` implementa cierre ordenado (deja de aceptar conexiones + cierra SQLite) antes de que Docker envíe `SIGKILL`.

### 3.6 Persistencia: por qué un volumen nombrado

La capa de escritura de un contenedor es **efímera**: se destruye con `docker compose down`. El volumen `panel-data` lo gestiona el daemon de Docker **fuera** del ciclo de vida del contenedor, así que los usuarios y toda la bitácora de auditoría sobreviven a reconstrucciones de la imagen.

---

## 4. Endpoints

Base URL: `http://localhost:8000`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | — | Estado del proceso |
| `POST` | `/api/auth/login` | — | Login, devuelve JWT (máx. 5 intentos/IP/min) |
| `GET` | `/api/services` | JWT | Estado de todos los servicios de la lista blanca |
| `GET` | `/api/services/:name` | JWT | Estado de un servicio |
| `POST` | `/api/services/:name/start` | JWT + admin | Iniciar servicio |
| `POST` | `/api/services/:name/stop` | JWT + admin | Detener servicio |
| `POST` | `/api/services/:name/restart` | JWT + admin | Reiniciar servicio |
| `GET` | `/api/logs?limit=50&offset=0` | JWT + admin | Bitácora de auditoría |

### Formato de error (todas las respuestas de error)

```json
{ "error": { "code": "STRING_CODE", "message": "Descripción legible" } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Usuario o contraseña incorrectos |
| `UNAUTHORIZED` | 401 | Token ausente, inválido o expirado |
| `FORBIDDEN` | 403 | Rol insuficiente (se requiere admin) |
| `SERVICE_NOT_ALLOWED` | 403 | Servicio fuera de `ALLOWED_SERVICES` |
| `INVALID_SERVICE_NAME` | 400 | El nombre no pasa el regex `^[a-z0-9@\-\._]+$` |
| `SYSTEMCTL_ERROR` | 500 | `systemctl` falló (el `message` trae su `stderr`) |
| `RATE_LIMITED` | 429 | Más de 5 intentos de login por IP en un minuto |
| `NOT_FOUND` | 404 | Ruta o acción inexistente |
| `INTERNAL_ERROR` | 500 | Error no controlado |

### Ejemplos con `curl`

**Health (sin auth)**

```bash
curl http://localhost:8000/api/health
# {"status":"ok","uptime":123.45}
```

**Login**

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin2026!"}'
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "username": "admin", "role": "admin" }
}
```

Guardar el token en una variable para el resto de los ejemplos:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin2026!"}' | jq -r .token)
```

**Listar servicios**

```bash
curl http://localhost:8000/api/services -H "Authorization: Bearer $TOKEN"
```

```json
{
  "services": [
    {
      "name": "nginx",
      "description": "A high performance web server and a reverse proxy server",
      "status": "active",
      "subState": "running",
      "pid": 1234,
      "uptimeSeconds": 7530,
      "memoryBytes": 12582912
    }
  ]
}
```

`status`: `active` | `inactive` | `failed` | `activating` | `deactivating` | `unknown`.
`pid`, `uptimeSeconds`, `memoryBytes`: `number | null`.

**Un servicio**

```bash
curl http://localhost:8000/api/services/nginx -H "Authorization: Bearer $TOKEN"
# {"service":{ ... }}
```

**Reiniciar (solo admin)**

```bash
curl -X POST http://localhost:8000/api/services/nginx/restart \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "action": "restart",
  "service": { "name": "nginx", "status": "active", "subState": "running", "pid": 4821, "uptimeSeconds": 0, "memoryBytes": 3145728, "description": "..." },
  "executedAt": "2026-08-04T14:30:00.000Z"
}
```

**Bitácora (solo admin)**

```bash
curl "http://localhost:8000/api/logs?limit=50&offset=0" -H "Authorization: Bearer $TOKEN"
```

```json
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
```

**Casos de error para la demostración**

```bash
# Servicio fuera de la lista blanca -> 403
curl http://localhost:8000/api/services/apache2 -H "Authorization: Bearer $TOKEN"
# {"error":{"code":"SERVICE_NOT_ALLOWED","message":"..."}}

# Intento de inyección -> 400 (y nunca llega a systemctl)
curl --path-as-is "http://localhost:8000/api/services/nginx%3Brm%20-rf%20%2F" \
  -H "Authorization: Bearer $TOKEN"
# {"error":{"code":"INVALID_SERVICE_NAME","message":"..."}}

# Acción de control con el usuario viewer -> 403
VTOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"viewer","password":"Viewer2026!"}' | jq -r .token)
curl -X POST http://localhost:8000/api/services/nginx/stop -H "Authorization: Bearer $VTOKEN"
# {"error":{"code":"FORBIDDEN","message":"Se requiere rol de administrador para esta operacion."}}
```

---

## 5. Decisiones de seguridad

1. **Lista blanca (`ALLOWED_SERVICES`)** — el panel solo puede tocar servicios declarados explícitamente. Sin esto, un admin podría detener `systemd-networkd` o `ssh` y dejar el servidor incomunicado.
2. **Validación por regex** — `^[a-z0-9@\-\._]+$` antes de tocar nada. Rechaza `;`, `|`, `$( )`, backticks, espacios, `../`.
3. **`execFile` y nunca `exec`** — `execFile` **no lanza un shell**, así que los metacaracteres quedan como texto literal. Con `exec` (que sí abre `/bin/sh`) el nombre del servicio se concatenaría a una línea de comando y habría inyección de comandos. Es la vulnerabilidad clásica de este tipo de paneles.
4. **Autorización por rol** — leer estado: cualquier usuario autenticado; `start`/`stop`/`restart` y la bitácora: solo `admin`.
5. **Timeout de 10 s** en cada `execFile` — una unidad colgada no deja un proceso hijo zombie ni bloquea el worker de Node.
6. **Rate limit de login** — 5 intentos por IP por minuto (ventana fija en memoria), contra fuerza bruta.
7. **`JWT_SECRET` obligatorio (fail-fast)** — arrancar con un secreto por defecto sería peor que no arrancar: cualquiera que conociera el default podría fabricarse un token de admin.
8. **Contraseñas con bcrypt (coste 10)** — nunca se almacenan en claro; el hash es lento a propósito.
9. **Mensajes de error genéricos en el login** — no se distingue "usuario inexistente" de "contraseña incorrecta" (evita enumeración de cuentas), y se compara contra un hash señuelo para igualar los tiempos de respuesta.
10. **Errores internos no se filtran al cliente** — los `500` inesperados se registran completos en el log del contenedor, pero al cliente le llega `INTERNAL_ERROR` genérico.
11. **Auditoría de todo** — cada login y cada acción de control (exitosa o fallida) queda en `audit_log` con usuario, servicio, resultado y timestamp.

---

## 6. Comandos útiles

```bash
# Logs en vivo del backend
docker compose logs -f backend

# Reiniciar solo el backend (tras cambiar el .env)
docker compose restart backend

# Reconstruir la imagen tras cambiar el código
docker compose up -d --build backend

# Estado y healthcheck
docker compose ps
docker inspect --format='{{.State.Health.Status}}' panel-backend

# Entrar al contenedor y probar systemctl a mano
docker compose exec backend bash
#   dentro:  systemctl status nginx --no-pager   <- consulta al systemd del HOST
#   dentro:  ps aux                              <- solo procesos del contenedor

# --- Demostración del namespace PID (para la defensa) ---
# Dentro del contenedor solo se ven sus propios procesos, y el PID 1 es Node:
docker compose exec backend ps aux
docker compose exec backend ps -p 1 -o pid,comm
# -> PID COMMAND
# ->   1 node

# En el host, en cambio, el PID 1 es systemd y ahí sí se ven TODOS los procesos
# (incluido el propio node del contenedor, con otro número de PID):
ps -p 1 -o pid,comm
ps aux | grep "node src/index.js"

# Comprobar que los sockets del host llegaron al contenedor (bind mounts)
docker compose exec backend ls -l /run/systemd /var/run/dbus/system_bus_socket

# --- Volumen de datos ---
docker volume ls | grep panel-data
docker volume inspect proyecto-final-so_panel-data

# Inspeccionar la base de datos SQLite desde un contenedor auxiliar
docker run --rm -it -v proyecto-final-so_panel-data:/data alpine \
  sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/panel.db \
  'SELECT id,username,action,service,success,timestamp FROM audit_log ORDER BY id DESC LIMIT 10;'"

# Borrar TODO (incluida la base de datos y los usuarios)
docker compose down -v
```

---

## 7. Estructura del proyecto

```
backend/
├── src/
│   ├── index.js                 # Entry point, Express, graceful shutdown (SIGTERM)
│   ├── config.js                # Variables de entorno + fail-fast de JWT_SECRET
│   ├── db.js                    # SQLite: esquema, seed idempotente, consultas
│   ├── middleware/
│   │   ├── auth.js              # Verifica el JWT -> req.user
│   │   ├── requireAdmin.js      # 403 si el rol no es admin
│   │   └── errorHandler.js      # AppError + formato de error unificado
│   ├── services/
│   │   └── systemctl.js         # ÚNICA capa que ejecuta procesos del sistema
│   ├── routes/
│   │   ├── auth.routes.js       # POST /login + rate limit
│   │   ├── services.routes.js   # GET/POST de servicios
│   │   └── logs.routes.js       # GET /logs
│   └── utils/
│       └── validate.js          # Regex + lista blanca
├── Dockerfile
├── .dockerignore
├── .env.example
├── package.json
└── README.md
```

---

## 8. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Todos los servicios en `unknown` | Los sockets del host no están montados o el host no usa systemd | Verificar los `volumes` de `docker-compose.yml` y que exista `/run/systemd` en el host |
| `SYSTEMCTL_ERROR: Failed to connect to bus` | Falta el bind mount del socket D-Bus | Revisar `/var/run/dbus/system_bus_socket` en el host |
| `SYSTEMCTL_ERROR: Interactive authentication required` | polkit no autoriza al cliente | El contenedor debe correr como root y con `cap_add: SYS_ADMIN` |
| `Unit nginx.service not found` | El servicio no está instalado en el host | `sudo apt install nginx` o quitarlo de `ALLOWED_SERVICES` |
| El contenedor no arranca, log `[FATAL] Falta JWT_SECRET` | `backend/.env` no existe o está incompleto | `cp backend/.env.example backend/.env` y definir el secreto |
| Cambié el `.env` y no surte efecto | Las variables se leen al arrancar | `docker compose restart backend` |
| Cambié la contraseña del seed y no se aplica | El seed solo corre con la tabla vacía | `docker compose down -v` (borra todos los datos) |
