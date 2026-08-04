# =============================================================================
#  Imagen del frontend — build MULTI-STAGE
#
#  ¿Por que dos etapas? Porque las herramientas para CONSTRUIR (Node, npm,
#  TypeScript, Vite y ~200 MB de node_modules) no hacen ninguna falta para
#  SERVIR el resultado: el navegador solo necesita HTML, CSS y JS ya
#  compilados. La etapa 2 parte de cero y copia unicamente la carpeta dist/,
#  de modo que la imagen final pesa decenas de MB en vez de cientos y no
#  contiene el codigo fuente ni el gestor de paquetes (menos superficie de
#  ataque).
# =============================================================================

# -----------------------------------------------------------------------------
# STAGE 1 — build: compila la aplicacion React con Vite
# -----------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Manifiestos primero: mientras no cambien, Docker reutiliza la capa de
# dependencias y no vuelve a ejecutar npm ci aunque cambie el codigo.
COPY package.json package-lock.json* ./
RUN npm ci

# Ahora si, el codigo fuente y la configuracion.
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src

# `npm run build` = tsc -b (verificacion de tipos en modo strict) + vite build.
# Si hubiera un error de tipos, la construccion de la imagen FALLA aqui: es
# imposible desplegar una version que no compile.
RUN npm run build

# -----------------------------------------------------------------------------
# STAGE 2 — serve: Nginx sirviendo los estaticos y haciendo de proxy /api
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS serve

# Se sustituye la configuracion por defecto por la nuestra (SPA + proxy).
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Solo viaja el resultado del build. Nada de node_modules ni de src/.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck con wget (ya incluido en la imagen alpine de Nginx).
#
# Se apunta a 127.0.0.1 y NO a "localhost" a proposito: dentro del contenedor
# el /etc/hosts define localhost tanto en IPv4 (127.0.0.1) como en IPv6 (::1),
# y wget intenta primero la IPv6. Como la directiva `listen 80;` de Nginx solo
# abre el socket IPv4, la sonda recibiria "Connection refused" y el contenedor
# quedaria marcado como unhealthy aunque el servidor funcione perfectamente.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

# "daemon off": Nginx debe quedarse en primer plano para ser el PID 1 del
# contenedor. Si se demonizara, el proceso principal terminaria y Docker
# daria el contenedor por finalizado.
CMD ["nginx", "-g", "daemon off;"]
