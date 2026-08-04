# PROMPT — FRONTEND: Panel Web de Control de Servicios Systemd (Dockerizado)

> Copia todo el contenido de este bloque como prompt para generar el frontend completo.
> Ejecutar DESPUÉS de tener el backend funcionando, para validar los contratos contra la API real.

---

Actúa como un Ingeniero Senior Frontend con experiencia en React, TypeScript, Vite, Tailwind CSS, Nginx y Docker.

Genera el **frontend completo y contenerizado** de un "Panel Web de Control de Servicios Systemd" que consume un backend Express existente. Proyecto universitario de Sistemas Operativos: el diseño debe ser limpio, profesional y fácil de demostrar en vivo (proyector).

## STACK OBLIGATORIO

- React 18 + Vite + TypeScript (modo `strict`)
- Tailwind CSS v4
- `react-router-dom` v6
- Sin librerías de estado externas: Context API + hooks
- `fetch` nativo con un wrapper tipado
- **Docker multi-stage** (build con Node, servido con Nginx) integrado al `docker-compose.yml` del proyecto

## ARQUITECTURA DE CONTENERIZACIÓN

1. **Dockerfile multi-stage:**
   - Stage 1 `build`: base `node:20-alpine`, copiar `package*.json` → `npm ci` → copiar el resto → `npm run build` (genera `/app/dist`).
   - Stage 2 `serve`: base `nginx:1.27-alpine`, copiar `dist/` a `/usr/share/nginx/html` y la config `nginx.conf` personalizada.
2. **nginx.conf** del contenedor:
   - Escucha en el puerto 80.
   - Sirve la SPA con fallback: `try_files $uri $uri/ /index.html;` (necesario para react-router).
   - **Proxy inverso:** `location /api/ { proxy_pass http://backend:8000; }` usando el nombre del servicio de Docker Compose como DNS interno (`backend`). Incluir headers `proxy_set_header Host $host;` y `X-Real-IP`.
   - Compresión gzip para js/css/json y cache de assets estáticos (`/assets/` con `Cache-Control: max-age=31536000, immutable`).
3. Gracias al proxy, el frontend llama a la API con **rutas relativas** (`/api/...`): no hay problemas de CORS en producción y una sola URL sirve todo. `VITE_API_URL` queda solo para desarrollo local (`npm run dev` fuera de Docker apuntando a `http://localhost:8000`); si la variable está vacía, el cliente usa rutas relativas.
4. Servicio en `docker-compose.yml` (agregar al archivo existente del backend):

```yaml
  frontend:
    build: ./frontend
    container_name: panel-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
```

5. Documentar en el README la comunicación entre contenedores: red bridge por defecto de Compose, resolución DNS interna por nombre de servicio, y el flujo Navegador → Nginx (contenedor frontend) → proxy → Express (contenedor backend) → D-Bus/systemd del host.

## CONFIGURACIÓN

- Base URL de la API: `import.meta.env.VITE_API_URL || ''` (cadena vacía = rutas relativas vía proxy Nginx).
- Token JWT en `localStorage` bajo la clave `panel_token`; usuario bajo `panel_user`.
- Si cualquier petición devuelve 401 → limpiar sesión y redirigir a `/login`.

## ESTRUCTURA

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Router + AuthProvider + ToastProvider
│   ├── types/api.ts               # TODOS los tipos del contrato (abajo)
│   ├── lib/apiClient.ts           # Wrapper fetch tipado con manejo de errores y 401 global
│   ├── context/
│   │   ├── AuthContext.tsx        # login, logout, user, token, isAdmin
│   │   └── ToastContext.tsx
│   ├── hooks/
│   │   ├── useServices.ts         # Polling cada 5s con setInterval + cleanup; pausable
│   │   └── useAuditLogs.ts        # Paginación limit/offset
│   ├── components/
│   │   ├── ProtectedRoute.tsx     # Redirige a /login si no hay sesión
│   │   ├── Layout.tsx             # Navbar: título, usuario, badge de rol, logout
│   │   ├── ServiceTable.tsx
│   │   ├── ServiceRow.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── ActionButtons.tsx
│   │   ├── ConfirmModal.tsx
│   │   └── Toast.tsx
│   └── pages/
│       ├── LoginPage.tsx
│       ├── DashboardPage.tsx
│       └── AuditLogPage.tsx       # Solo visible/accesible para rol admin
├── Dockerfile
├── nginx.conf
├── .dockerignore
├── .env.example
├── tailwind.config / vite.config.ts
└── README.md
```

## CONTRATOS DE DATOS — copiar EXACTAMENTE en `types/api.ts`

```typescript
export type Role = 'admin' | 'viewer';
export type ServiceState =
  | 'active' | 'inactive' | 'failed'
  | 'activating' | 'deactivating' | 'unknown';
export type ServiceAction = 'start' | 'stop' | 'restart';

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ServiceStatus {
  name: string;
  description: string;
  status: ServiceState;
  subState: string;
  pid: number | null;
  uptimeSeconds: number | null;
  memoryBytes: number | null;
}

export interface ServicesResponse {
  services: ServiceStatus[];
}

export interface ActionResponse {
  action: ServiceAction;
  service: ServiceStatus;   // estado DESPUÉS de la acción
  executedAt: string;       // ISO 8601
}

export interface AuditLogEntry {
  id: number;
  username: string;
  action: ServiceAction | 'login';
  service: string | null;
  success: boolean;
  detail: string | null;
  timestamp: string;        // ISO 8601
}

export interface LogsResponse {
  total: number;
  logs: AuditLogEntry[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
```

## ENDPOINTS QUE CONSUME

| Método | Ruta | Respuesta | Notas |
|---|---|---|---|
| POST | `/api/auth/login` | `LoginResponse` | Público |
| GET | `/api/services` | `ServicesResponse` | Polling 5s |
| GET | `/api/services/:name` | `{ service: ServiceStatus }` | |
| POST | `/api/services/:name/start` | `ActionResponse` | Solo admin |
| POST | `/api/services/:name/stop` | `ActionResponse` | Solo admin |
| POST | `/api/services/:name/restart` | `ActionResponse` | Solo admin |
| GET | `/api/logs?limit=50&offset=0` | `LogsResponse` | Solo admin |

Todas las rutas protegidas llevan header `Authorization: Bearer <token>`.
Errores del backend llegan con el formato `ApiError` y códigos: `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`, `SERVICE_NOT_ALLOWED`, `INVALID_SERVICE_NAME`, `SYSTEMCTL_ERROR`, `RATE_LIMITED`, `NOT_FOUND`, `INTERNAL_ERROR`.

## PANTALLAS Y COMPORTAMIENTO

### LoginPage (`/login`)
- Card centrada, campos username/password, botón con estado loading.
- Error `INVALID_CREDENTIALS` → mensaje rojo bajo el formulario; `RATE_LIMITED` → mensaje "Demasiados intentos, espera un minuto".
- Si ya existe sesión → redirect automático a `/`.

### DashboardPage (`/`)
- Tabla de servicios: columnas **Servicio** (nombre + descripción), **Estado** (`StatusBadge`), **PID**, **Uptime** (formatear segundos → `"2h 14m"`), **Memoria** (formatear bytes → `"12.0 MB"`), **Acciones**.
- `StatusBadge`: `active` = verde con punto pulsante (`animate-pulse`), `inactive` = gris, `failed` = rojo, estados transitorios = ámbar.
- `ActionButtons`: **Start** (verde, deshabilitado si `active`), **Stop** (rojo, deshabilitado si `inactive`), **Restart** (ámbar). Si rol = `viewer`, no renderizar botones (mostrar `—`).
- Stop y Restart abren `ConfirmModal` (ej: "¿Detener nginx? El servicio dejará de responder").
- Durante una acción: spinner en la fila y botones deshabilitados; al terminar, Toast de éxito ("nginx reiniciado correctamente") o de error (mensaje del backend).
- Polling cada 5s en `useServices`; **pausar el polling mientras hay una acción en curso**.
- Header de la página: contador "X de Y servicios activos" + timestamp de última actualización.

### AuditLogPage (`/logs`, solo admin)
- Tabla: **Fecha** (formato local `es-DO`), **Usuario**, **Acción**, **Servicio**, **Resultado** (✓/✗), **Detalle**.
- Paginación con botones Anterior/Siguiente usando `limit`/`offset` y `total`.
- Si un `viewer` navega manualmente a `/logs` → redirect a `/`.

## CALIDAD

- TypeScript `strict` sin `any`. Manejo de estados loading / error / empty en cada vista.
- Diseño responsive (la tabla colapsa a cards en móvil).
- Dark mode opcional con clase de Tailwind (bonus para la demo).
- `README.md` con: desarrollo local (`npm run dev` + `VITE_API_URL`), build de producción con Docker, integración al `docker-compose.yml`, y diagrama del flujo Navegador → Nginx → proxy `/api` → backend.
- Comentarios en español en los hooks, el `apiClient` y el `nginx.conf` (defensa académica).

## VERIFICACIÓN FINAL

Al terminar, incluir una checklist de humo:

1. `docker compose up -d --build` levanta ambos contenedores sin errores.
2. `http://<IP-del-host>` carga el login servido por Nginx.
3. Login como `admin` → dashboard con servicios reales del host.
4. Reiniciar nginx del host desde la web → el badge cambia de estado y aparece el toast.
5. Login como `viewer` → sin botones de acción y sin acceso a `/logs`.
6. `docker compose logs -f frontend` muestra las peticiones proxied a `/api`.
