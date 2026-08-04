# =============================================================================
#  Imagen del backend — Panel Web de Control de Servicios Systemd
# =============================================================================
#  Se usa Debian (bookworm) y NO Alpine por dos razones:
#   1) El paquete `systemd` (del que solo necesitamos el binario CLIENTE
#      `systemctl`) existe en Debian; Alpine usa OpenRC y no lo trae.
#   2) better-sqlite3 publica binarios precompilados para glibc; en Alpine
#      (musl) habria que compilarlo desde cero.
#
#  IMPORTANTE: instalar el paquete systemd NO significa que el contenedor
#  ejecute systemd. El PID 1 del contenedor es Node (ver el CMD del final).
#  `systemctl` es solo un cliente que envia mensajes por D-Bus; el que ejecuta
#  las ordenes es el systemd del HOST, alcanzable gracias a los sockets que
#  docker-compose monta dentro del contenedor.
# =============================================================================
FROM node:20-bookworm-slim

# --- Cliente systemctl + procps ---------------------------------------------
#  systemd -> solo por el binario CLIENTE `systemctl`.
#  procps  -> aporta `ps`, que la imagen slim no trae. No hace falta para que
#             la aplicacion funcione, pero es clave para la DEMOSTRACION
#             academica: permite ejecutar `ps aux` dentro del contenedor y
#             comprobar en vivo que el namespace PID lo aisla (solo se ven sus
#             propios procesos, con Node como PID 1, y ninguno del host) pese a
#             que si puede controlar el systemd del anfitrion via D-Bus.
#
# La limpieza de /var/lib/apt/lists va en la MISMA capa que el install: si se
# hiciera en un RUN aparte, la cache de apt quedaria igualmente guardada en la
# capa anterior y la imagen no adelgazaria.
RUN apt-get update \
    && apt-get install -y --no-install-recommends systemd procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencias -----------------------------------------------------------
# Se copian primero SOLO los manifiestos para aprovechar la cache de capas de
# Docker: mientras package.json/package-lock.json no cambien, esta capa se
# reutiliza y `npm ci` no se vuelve a ejecutar aunque cambie el codigo fuente.
COPY package.json package-lock.json* ./

# `npm ci` (no `npm install`): instalacion reproducible y exacta segun el
# lockfile. --omit=dev deja fuera las dependencias de desarrollo.
# Las herramientas de compilacion se instalan y se eliminan en la MISMA capa;
# solo se usan si better-sqlite3 no encuentra un binario precompilado para
# esta plataforma.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# --- Codigo fuente ----------------------------------------------------------
# Va al final porque es lo que mas cambia: asi un cambio en src/ solo invalida
# esta capa y no la reinstalacion de dependencias.
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8000

# --- Healthcheck ------------------------------------------------------------
# Se usa node en vez de curl/wget para no instalar paquetes extra (y no ampliar
# la superficie de ataque de la imagen). Sale con codigo 1 si /api/health no
# responde 200, y Docker marca el contenedor como "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:8000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# El contenedor corre como root (usuario por defecto de la imagen). Es
# deliberado: al conectarse al D-Bus del host como root, polkit del anfitrion
# autoriza start/stop/restart sin pedir contrasena ni usar sudo.
CMD ["node", "src/index.js"]
