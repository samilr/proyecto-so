# Panel Web de Control de Servicios Systemd

**Grupo 4 — Proyecto final de Sistemas Operativos**

Aplicación web que permite administrar los servicios de un servidor Ubuntu (`nginx`, `mysql`, `ssh`…) desde el navegador, sin usar la terminal. El usuario inicia sesión, ve una tabla con el estado de los servicios en tiempo real y puede iniciarlos, detenerlos o reiniciarlos con un botón. Por detrás, una API REST en Node.js ejecuta los comandos `systemctl` **reales** del sistema operativo anfitrión.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                              │
│  React 18 + TypeScript + Tailwind · tabla en vivo, polling cada 5 s     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  HTTP :8080
┌────────────────────────────────▼────────────────────────────────────────┐
│  CONTENEDOR panel-frontend  ·  Nginx                                    │
│  Sirve la SPA + proxy inverso /api → http://backend:8000                │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  red bridge interna de Docker Compose
┌────────────────────────────────▼────────────────────────────────────────┐
│  CONTENEDOR panel-backend  ·  Node.js 20 + Express                      │
│  JWT → rol → lista blanca → execFile('systemctl', […]) → audit_log      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  socket D-Bus del host (bind mount)
┌────────────────────────────────▼────────────────────────────────────────┐
│  HOST Ubuntu  ·  systemd (PID 1)  ejecuta start / stop / restart        │
└─────────────────────────────────────────────────────────────────────────┘
```

Documentación detallada por capa:

- [`backend/README.md`](backend/README.md) — API, contratos, y la explicación académica de namespaces y D-Bus
- [`frontend/README.md`](frontend/README.md) — SPA, proxy de Nginx, comunicación entre contenedores

---

## 1. Cómo el proyecto cubre el enunciado

| Requisito del enunciado | Implementación |
|---|---|
| Administrar servicios de Ubuntu desde el navegador | SPA React servida por Nginx, sin terminal |
| Inicio de sesión | JWT (8 h) + bcrypt, roles `admin` / `viewer` |
| Tabla con estado en tiempo real (verde/rojo) | `StatusBadge` con los 6 estados de systemd + polling cada 5 s |
| Botones iniciar / detener / reiniciar | `POST /api/services/:name/{start\|stop\|restart}` |
| Backend Node.js + Express, API REST en JSON | `backend/src/` — endpoints documentados |
| Ejecutar comandos `systemctl` reales | `backend/src/services/systemctl.js` |
| Lista blanca contra inyección de comandos | SQLite dinámica + regex `^[a-z0-9@\-\._]+$` |
| Autenticación con JWT | `middleware/auth.js` + `middleware/requireAdmin.js` |
| Log de auditoría de cada acción | Tabla `audit_log` en SQLite + pantalla `/logs` |
| Restricción de permisos a nivel de SO | Backend sin capabilities Linux (`cap_drop: ALL`) + AppArmor limitado a D-Bus/systemd + polkit — ver §4 |
| La aplicación instalada como servicio systemd | [`deploy/panel-web.service`](deploy/panel-web.service) — ver §3 |

### Una desviación deliberada: `execFile` en lugar de `exec`

El enunciado menciona `child_process.exec`. El proyecto usa **`execFile`**, y es una mejora, no un descuido:

```js
// exec: construye una cadena y la pasa a /bin/sh -c
exec(`systemctl restart ${name}`);
// name = "nginx; rm -rf /"  →  el shell ejecuta AMBOS comandos.

// execFile: no hay shell; los argumentos van en un array
execFile('systemctl', ['restart', name]);
// name = "nginx; rm -rf /"  →  se pasa como UN argumento literal.
//                              systemctl responde "unit not found".
```

El propio enunciado exige "evitando inyección de comandos", y `exec` es exactamente el mecanismo que la habilita. `execFile` cumple el objetivo declarado; la lista blanca y el regex son la segunda y tercera capa de defensa.

---

## 2. Puesta en marcha rápida

Requisitos en el host: **Ubuntu Server 22.04+**, Docker Engine 24+ y Docker Compose v2.

```bash
git clone <url-del-repo> proyecto-final-so
cd proyecto-final-so

cp backend/.env.example backend/.env
openssl rand -hex 32                  # pegar el resultado en JWT_SECRET
nano backend/.env                     # JWT_SECRET y lista inicial de servicios

sudo apparmor_parser -r -W deploy/apparmor.d/panel-web-backend
docker compose up -d --build
```

| URL | Contenido |
|---|---|
| `http://<IP-del-host>:8080/` | El panel |
| `http://<IP-del-host>:8000/api/health` | La API directa (para depurar con `curl`) |

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `Admin2026!` | Ver estados, controlar servicios, ver la bitácora |
| `viewer` | `Viewer2026!` | Solo ver estados |

---

## 3. Instalar el panel como servicio de systemd

Con esto la aplicación deja de ser «algo que alguien levanta a mano» y pasa a ser **un servicio del sistema más**, gestionado por el mismo systemd que administra.

```bash
sudo ./deploy/install.sh
```

El script comprueba requisitos, copia el proyecto a `/opt/panel-web`, genera un `JWT_SECRET` aleatorio con permisos `600` si aún no existe `.env`, e instala y habilita la unit. Es idempotente: volver a ejecutarlo actualiza el código sin tocar el `.env` ni la base de datos.

Instalación manual equivalente:

```bash
sudo mkdir -p /opt/panel-web
sudo cp -r . /opt/panel-web/
sudo install -m 644 deploy/panel-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now panel-web
```

Gestión a partir de ese momento:

```bash
sudo systemctl start   panel-web
sudo systemctl stop    panel-web
sudo systemctl restart panel-web
sudo systemctl status  panel-web
journalctl -u panel-web -f          # logs en el journal del sistema
```

### Qué demuestra la unit (para la defensa)

| Directiva | Concepto de la materia |
|---|---|
| `Requires=docker.service` | Dependencia **fuerte**: si Docker cae, systemd detiene el panel |
| `After=docker.service` | **Orden** de arranque — `Requires` por sí solo no lo garantiza |
| `Type=oneshot` | `docker compose up -d` termina y no deja un proceso en primer plano |
| `RemainAfterExit=yes` | Sin esto la unit quedaría «inactive» al instante y `stop` no ejecutaría `ExecStop` |
| `WantedBy=multi-user.target` | El *runlevel* de un servidor sin entorno gráfico: arranque automático en cada boot |

> **Lista dinámica:** un administrador puede pulsar **Agregar servicio**. El backend valida la unidad contra systemd y la guarda en SQLite sin reiniciar Docker. `ALLOWED_SERVICES` solo sirve para sembrar la lista durante la primera ejecución de una base nueva.

---

## 4. Permisos a nivel de sistema operativo: polkit en vez de sudoers

El enunciado plantea configurar `sudoers` para que el usuario de la aplicación solo pueda ejecutar `systemctl` sobre ciertos servicios. Este proyecto usa un despliegue **contenerizado**, donde el mecanismo es distinto. Conviene tener clara la comparación, porque es una pregunta probable en la defensa.

### Cómo funcionaría con sudoers (despliegue nativo)

La app corre como un usuario sin privilegios (`panel`) y escala a root solo para comandos concretos:

```
panel ALL=(root) NOPASSWD: /usr/bin/systemctl start nginx, \
                           /usr/bin/systemctl stop nginx, \
                           /usr/bin/systemctl restart nginx
```

La restricción vive en el **sistema operativo**: aunque la aplicación fuera comprometida por completo, `sudo` rechazaría cualquier comando fuera de esa lista.

### Cómo funciona aquí (despliegue con Docker)

1. El contenedor **no usa `sudo`**: su proceso ya es root *dentro de su propio espacio*.
2. `systemctl` no manipula procesos: envía mensajes **D-Bus** al systemd del host por el socket montado.
3. **polkit** del host recibe la petición, ve un cliente con UID 0 y la autoriza sin contraseña.
4. Qué servicios se pueden tocar lo decide la **lista blanca de la aplicación**.

### La diferencia honesta

| | sudoers (nativo) | polkit + contenedor (este proyecto) |
|---|---|---|
| Dónde se restringe *qué servicios* | Sistema operativo | Aplicación (lista dinámica en SQLite) |
| Si la app es comprometida | El SO sigue bloqueando lo no listado | Un atacante con ejecución de código podría tocar otras units |
| Aislamiento del proceso | Solo permisos de usuario | Namespaces PID/mount/net + cgroups + capabilities |
| Superficie expuesta al host | Todo el sistema de archivos | Únicamente 2 sockets montados |

**No son equivalentes**, y decirlo es más defendible que afirmar lo contrario: el modelo contenerizado gana en aislamiento del proceso pero mueve la restricción por servicio de la capa del SO a la capa de la aplicación. Las mitigaciones concretas son:

- `cap_drop: [ALL]` — el backend no recibe ninguna capability Linux; `systemctl` solo necesita conectarse a D-Bus.
- Solo se montan el socket D-Bus y el marcador `/run/systemd/system`, ambos en modo de solo lectura; el resto del sistema de archivos del host es invisible para el contenedor.
- El perfil `panel-web-backend` conserva el aislamiento AppArmor de Docker y solo permite mensajes D-Bus hacia el broker y `org.freedesktop.systemd1`.
- Tres capas antes de llegar a `systemctl`: JWT válido → rol `admin` → regex + lista blanca.
- `execFile` sin shell, con timeout de 10 s.
- Toda acción, exitosa o fallida, queda en `audit_log` con usuario, servicio y motivo.

Si se necesitara la restricción a nivel de SO, el camino es desplegar sin Docker: usuario `panel` sin privilegios, `/etc/sudoers.d/panel-web` con la lista de comandos permitidos, y una unit propia para el backend.

---

## 5. Estructura del repositorio

```
proyecto-final-so/
├── docker-compose.yml         # Orquesta backend + frontend
├── README.md                  # Este archivo
├── deploy/
│   ├── panel-web.service      # Unit: la app como servicio de systemd
│   └── install.sh             # Instalador idempotente para Ubuntu
├── backend/                   # Node.js 20 + Express + SQLite
│   ├── src/                   # config, db, middleware, routes, services, utils
│   ├── Dockerfile             # node:20-bookworm-slim + cliente systemctl
│   └── README.md              # API, contratos y explicación de namespaces
└── frontend/                  # React 18 + Vite + TypeScript + Tailwind v4
    ├── src/                   # pages, components, hooks, context, lib
    ├── Dockerfile             # Multi-stage: build con Node → sirve con Nginx
    ├── nginx.conf             # SPA fallback + proxy /api + gzip + caché
    └── README.md              # Flujo completo y checklist de humo
```

---

## 6. Guion sugerido para la demostración

1. **`systemctl status panel-web`** en el host — el panel es un servicio del sistema, con su PID y su árbol de procesos.
2. **`docker compose ps`** — dos contenedores `healthy`.
3. **Abrir el panel**, iniciar sesión como `admin`.
4. **`docker compose exec backend ps aux`** — dentro del contenedor solo hay `node` como PID 1: el namespace PID lo aísla del host.
5. **Reiniciar `nginx` desde la web** → el badge cambia, aparece el toast, el PID y el uptime se reinician.
6. **`systemctl status nginx`** en el host — confirma que el reinicio fue real, no una simulación.
7. **Intentar un servicio fuera de la lista blanca** con `curl` → `403 SERVICE_NOT_ALLOWED`.
8. **Intentar una inyección** (`nginx;rm -rf /`) → `400 INVALID_SERVICE_NAME`, sin llegar nunca a `systemctl`.
9. **Entrar como `viewer`** → sin botones, sin acceso a `/logs`; y con `curl` directo → `403 FORBIDDEN` (la seguridad está en el backend, no en la interfaz).
10. **Pantalla de Auditoría** — todos los intentos anteriores registrados con usuario, resultado y motivo del fallo.
