# Frontend — Panel Web de Control de Servicios Systemd

SPA en React 18 + Vite + TypeScript (`strict`) + Tailwind CSS v4, servida por Nginx dentro de un contenedor Docker. Consume la API Express del `backend/`.

Proyecto final de la asignatura de **Sistemas Operativos**.

---

## 1. Flujo completo de una petición

Este diagrama es el que resume el proyecto entero: desde un clic en el navegador hasta un proceso reiniciado en el sistema operativo anfitrión.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR  (http://<IP-del-host>/)                                      │
│  React SPA — clic en "Reiniciar nginx"                                   │
│  fetch('/api/services/nginx/restart')   ← ruta RELATIVA, mismo origen    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTP :80
┌───────────────────────────────▼──────────────────────────────────────────┐
│  CONTENEDOR  panel-frontend   (nginx:1.27-alpine)                        │
│                                                                          │
│   location /            → try_files … /index.html   (SPA, react-router)  │
│   location /assets/     → caché inmutable de 1 año                       │
│   location /api/        → proxy_pass http://backend:8000                 │
│                                    ▲                                     │
│                          "backend" lo resuelve el DNS interno de Docker  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ red bridge de Compose (DNS 127.0.0.11)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  CONTENEDOR  panel-backend    (node:20-bookworm-slim)                    │
│                                                                          │
│   Express :8000 → verifica JWT → verifica rol admin                      │
│                 → lista blanca + regex del nombre                        │
│                 → execFile('systemctl', ['restart', 'nginx'])            │
│                 → registra la acción en audit_log (SQLite)               │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ socket UNIX montado del host (bind mount)
                                │ /var/run/dbus/system_bus_socket
┌───────────────────────────────▼──────────────────────────────────────────┐
│  HOST Ubuntu — systemd (PID 1)                                           │
│  Recibe el mensaje D-Bus  org.freedesktop.systemd1.Manager.RestartUnit   │
│  y reinicia nginx REALMENTE en el servidor.                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Comunicación entre contenedores

- **Red bridge de Compose:** `docker compose up` crea una red propia del proyecto y conecta a ella `backend` y `frontend`. Están aislados del resto de la máquina pero se ven entre sí.
- **DNS interno:** Docker levanta un resolvedor en `127.0.0.11` dentro de cada contenedor que traduce el **nombre del servicio** de `docker-compose.yml` a la IP del contenedor. Por eso `nginx.conf` escribe `proxy_pass http://backend:8000` sin conocer ninguna IP; si el contenedor se recrea y cambia de IP, el nombre sigue funcionando.
- **Un solo puerto publicado:** al navegador solo se le expone el `:80` del frontend. El `:8000` del backend se publica únicamente para poder probar la API con `curl` durante la demostración; el frontend no lo necesita, porque le habla por la red interna.

### Por qué no hay problema de CORS en producción

CORS es una restricción del **navegador**: se activa cuando una página pide datos a un origen (esquema + dominio + puerto) distinto al suyo. Como Nginx sirve **la SPA y la API bajo el mismo origen** (`http://<host>/` y `http://<host>/api/...`), para el navegador es todo el mismo sitio y ni siquiera envía la petición de verificación previa (*preflight*).

En desarrollo local sí hay dos orígenes (`:5173` de Vite y `:8000` de Express) y por eso el backend declara `CORS_ORIGIN`.

---

## 2. Desarrollo local (sin Docker)

Requiere el backend corriendo en `http://localhost:8000` y **Node.js 20+**.

```bash
cd frontend
cp .env.example .env        # define VITE_API_URL=http://localhost:8000
npm install
npm run dev                 # http://localhost:5173
```

En el `.env` del **backend** debe estar `CORS_ORIGIN=http://localhost:5173`, o el navegador bloqueará las respuestas.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | `tsc -b` (chequeo de tipos) + `vite build` → `dist/` |
| `npm run preview` | Sirve el `dist/` ya construido, para probarlo antes de dockerizar |
| `npm run typecheck` | Solo verificación de tipos |

### Variable `VITE_API_URL`

| Entorno | Valor | Resultado |
|---|---|---|
| Desarrollo (`npm run dev`) | `http://localhost:8000` | El cliente llama a la URL absoluta del backend |
| Producción (Docker) | vacía / sin definir | El cliente usa rutas relativas `/api/...` que resuelve el proxy de Nginx |

Solo las variables con prefijo `VITE_` llegan al bundle del navegador: es la protección de Vite para no filtrar secretos del servidor.

---

## 3. Producción con Docker

El `Dockerfile` es **multi-stage**:

| Etapa | Base | Qué hace |
|---|---|---|
| 1 · `build` | `node:20-alpine` | `npm ci` → `npm run build` → genera `/app/dist` |
| 2 · `serve` | `nginx:1.27-alpine` | Copia **solo** `dist/` y el `nginx.conf` |

La imagen final **no contiene** Node, ni npm, ni `node_modules`, ni el código fuente: únicamente HTML/CSS/JS compilados. Pesa decenas de MB en vez de cientos y reduce la superficie de ataque.

Un detalle importante: `npm run build` ejecuta `tsc -b` **antes** de Vite. Si hay un error de tipos, la construcción de la imagen falla y es imposible desplegar una versión que no compile.

### Levantar el proyecto completo

Desde la **raíz del repositorio** (no desde `frontend/`):

```bash
cp backend/.env.example backend/.env     # definir JWT_SECRET
docker compose up -d --build
```

| URL | Sirve |
|---|---|
| `http://<IP-del-host>/` | El panel (Nginx) |
| `http://<IP-del-host>/api/health` | La API, a través del proxy |
| `http://<IP-del-host>:8000/api/health` | La API directa (solo para depurar con `curl`) |

### Comandos útiles

```bash
# Peticiones proxied a /api en vivo
docker compose logs -f frontend

# Reconstruir solo el frontend tras cambiar el código
docker compose up -d --build frontend

# Comprobar que el proxy resuelve el nombre "backend" por DNS interno
docker compose exec frontend wget -qO- http://backend:8000/api/health

# Ver la configuración de Nginx que quedó dentro del contenedor
docker compose exec frontend cat /etc/nginx/conf.d/default.conf

# Validar la sintaxis de nginx.conf sin reiniciar
docker compose exec frontend nginx -t
```

---

## 4. Estructura

```
frontend/
├── src/
│   ├── main.tsx                  # Montaje de React sobre #root
│   ├── App.tsx                   # Router + AuthProvider + ToastProvider
│   ├── index.css                 # Tailwind v4 (config CSS-first) + animaciones
│   ├── types/api.ts              # Contrato de datos compartido con el backend
│   ├── lib/
│   │   ├── apiClient.ts          # fetch tipado, JWT, manejo global del 401
│   │   └── format.ts             # uptime, bytes y fechas es-DO
│   ├── context/
│   │   ├── AuthContext.tsx       # login, logout, user, token, isAdmin
│   │   └── ToastContext.tsx      # Cola de notificaciones
│   ├── hooks/
│   │   ├── useServices.ts        # Polling 5 s, pausable, con cleanup
│   │   └── useAuditLogs.ts       # Paginación limit/offset
│   ├── components/
│   │   ├── ProtectedRoute.tsx    # Guardia de sesión y de rol
│   │   ├── Layout.tsx            # Navbar + Outlet
│   │   ├── ServiceTable.tsx      # Tabla + estados loading/error/empty
│   │   ├── ServiceRow.tsx        # Fila (escritorio) y tarjeta (móvil)
│   │   ├── StatusBadge.tsx       # Colores por ActiveState de systemd
│   │   ├── ActionButtons.tsx     # Start / Stop / Restart según rol y estado
│   │   ├── ConfirmModal.tsx      # Confirmación de acciones destructivas
│   │   ├── Toast.tsx             # Presentación de las notificaciones
│   │   └── ThemeToggle.tsx       # Modo claro / oscuro
│   └── pages/
│       ├── LoginPage.tsx
│       ├── DashboardPage.tsx
│       └── AuditLogPage.tsx      # Solo admin
├── Dockerfile                    # Multi-stage build + serve
├── nginx.conf                    # SPA fallback + proxy /api + gzip + caché
├── .dockerignore
├── .env.example
├── vite.config.ts
└── tsconfig*.json                # strict, noUnusedLocals, noUnusedParameters
```

> **Sobre `tailwind.config.js`:** Tailwind CSS v4 usa configuración *CSS-first*. El tema y la variante de modo oscuro se declaran con `@theme` y `@custom-variant` dentro de [`src/index.css`](src/index.css), y la integración con Vite es el plugin `@tailwindcss/vite`. Por eso no existen `tailwind.config.js` ni `postcss.config.js`.

---

## 5. Decisiones de implementación

1. **Sin librerías de estado externas.** El estado global es mínimo (usuario + token + toasts): la Context API basta y evita una dependencia más que justificar.
2. **Polling en lugar de WebSockets.** systemd no notifica cambios: hay que preguntarle con `systemctl show`. Un WebSocket trasladaría el mismo sondeo al servidor con más complejidad. 5 segundos equilibra frescura y carga sobre el D-Bus del host.
3. **El polling se pausa durante una acción.** Sin esto, una respuesta del sondeo emitida *antes* del reinicio puede llegar *después* y sobrescribir el estado nuevo con el viejo — una condición de carrera visible en pantalla.
4. **Cancelación con `AbortController`.** Cada petición del hook se cancela al desmontar el componente o al lanzarse una nueva, evitando respuestas huérfanas y avisos de `setState` sobre componentes desmontados.
5. **Manejo global del 401.** El `apiClient` avisa al `AuthContext` en cuanto el token expira (8 h) o es inválido; se limpia la sesión una sola vez y `ProtectedRoute` redirige al login de forma declarativa.
6. **Los permisos del cliente son solo UX.** Ocultar los botones a un `viewer` es comodidad visual; la seguridad real es que el backend responde `403 FORBIDDEN` a cualquier POST de un viewer, aunque se fabrique con `curl`. **Nunca se confía en el frontend.**
7. **JWT en `localStorage`.** Sobrevive al F5. Es vulnerable a XSS, aceptable aquí porque no hay contenido de terceros ni HTML generado por usuarios; la alternativa robusta sería una cookie `httpOnly` + `SameSite` emitida por el backend.
8. **TypeScript `strict` sin `any`.** Con `noUnusedLocals` y `noUnusedParameters`, el código muerto es un error de compilación, no una advertencia.
9. **Accesibilidad.** `aria-live` en los toasts, `role="dialog"` con foco y cierre por `Escape` en el modal, `role="alert"` en los errores de formulario, y `prefers-reduced-motion` respetado en las animaciones.

---

## 6. Checklist de humo (verificación final)

Ejecutar en el host Ubuntu, con `nginx` instalado y en `ALLOWED_SERVICES`:

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | `docker compose up -d --build` | Ambos contenedores en `Up`; `docker compose ps` los muestra `healthy` |
| 2 | Abrir `http://<IP-del-host>` | Carga la pantalla de login servida por Nginx |
| 3 | Login como `admin` / `Admin2026!` | Dashboard con los servicios **reales** del host y sus PID/uptime/memoria |
| 4 | Pulsar **Reiniciar** en `nginx` y confirmar | Spinner en la fila → toast verde "nginx reiniciado correctamente" → el PID cambia y el uptime vuelve a 0 |
| 5 | Detener `nginx` desde el panel | El badge pasa a gris "Inactivo"; `systemctl status nginx` en el host lo confirma |
| 6 | Ir a **Auditoría** | Aparecen las acciones con usuario, servicio, resultado y fecha en formato `es-DO` |
| 7 | Salir y entrar como `viewer` / `Viewer2026!` | Sin botones de acción (columna con `—`) y sin el enlace *Auditoría* |
| 8 | Escribir `/logs` a mano en la URL como `viewer` | Redirige al dashboard |
| 9 | Estando en `/logs` como admin, pulsar F5 | La página recarga sin 404 (lo garantiza `try_files … /index.html`) |
| 10 | `docker compose logs -f frontend` | Se ven las peticiones `GET /api/services` proxied cada 5 s |
| 11 | Detener el backend (`docker compose stop backend`) | La tabla muestra el error de conexión y se recupera sola al levantarlo de nuevo |
| 12 | Reducir la ventana a ancho de móvil | La tabla colapsa a tarjetas legibles |
