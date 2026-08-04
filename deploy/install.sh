#!/usr/bin/env bash
# =============================================================================
#  install.sh — Instala el Panel Web como servicio de systemd en Ubuntu.
#
#  Uso:  sudo ./deploy/install.sh
#
#  Que hace, en orden:
#    1. Comprueba requisitos (root, systemd, Docker, Compose v2).
#    2. Copia el proyecto a /opt/panel-web  (convencion FHS para software
#       instalado a mano, fuera de los paquetes de la distribucion).
#    3. Crea backend/.env con un JWT_SECRET aleatorio si aun no existe.
#    4. Instala y habilita panel-web.service.
#
#  Es IDEMPOTENTE: se puede volver a ejecutar para actualizar el codigo sin
#  perder el .env ni la base de datos (que vive en el volumen panel-data).
# =============================================================================
set -euo pipefail

INSTALL_DIR="/opt/panel-web"
UNIT_NAME="panel-web.service"
UNIT_DIR="/etc/systemd/system"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colores solo si la salida es un terminal (no ensucia los logs redirigidos).
if [ -t 1 ]; then
  R="\033[0;31m"; G="\033[0;32m"; Y="\033[0;33m"; B="\033[0;34m"; N="\033[0m"
else
  R=""; G=""; Y=""; B=""; N=""
fi

info()  { printf "${B}==>${N} %s\n" "$1"; }
ok()    { printf "${G} ok ${N} %s\n" "$1"; }
warn()  { printf "${Y}aviso${N} %s\n" "$1"; }
fail()  { printf "${R}ERROR${N} %s\n" "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Requisitos
# ---------------------------------------------------------------------------
info "Comprobando requisitos del sistema..."

[ "$(id -u)" -eq 0 ] || fail "Este script debe ejecutarse como root:  sudo $0"

# /run/systemd/system solo existe si systemd es realmente el init (PID 1).
[ -d /run/systemd/system ] || fail "Este sistema no usa systemd como init. El panel requiere Ubuntu/Debian con systemd."

command -v docker >/dev/null 2>&1 || fail "Docker no esta instalado. Instalalo con:  sudo apt install docker.io"

# Compose v2 es un subcomando de docker, no el binario docker-compose de v1.
docker compose version >/dev/null 2>&1 || fail "No se encontro Docker Compose v2. Instalalo con:  sudo apt install docker-compose-plugin"

systemctl is-active --quiet docker || {
  warn "El daemon de Docker no esta activo; intentando arrancarlo..."
  systemctl start docker || fail "No se pudo arrancar docker.service"
}

ok "Requisitos satisfechos ($(docker --version | cut -d, -f1))."

# ---------------------------------------------------------------------------
# 2. Copiar el proyecto a /opt/panel-web
# ---------------------------------------------------------------------------
if [ "$PROJECT_DIR" = "$INSTALL_DIR" ]; then
  info "El proyecto ya esta en $INSTALL_DIR; se omite la copia."
else
  info "Copiando el proyecto a $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"

  # SIN --delete a proposito: no se borra nada que ya exista en el destino
  # (por ejemplo un backend/.env con el secreto de produccion).
  # Se excluyen node_modules y dist porque las imagenes los reconstruyen.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude 'node_modules' \
      --exclude 'dist' \
      --exclude '.git' \
      --exclude '*.tsbuildinfo' \
      --exclude 'backend/.env' \
      "$PROJECT_DIR"/ "$INSTALL_DIR"/
  else
    warn "rsync no esta disponible; usando cp (puede copiar node_modules)."
    cp -a "$PROJECT_DIR"/. "$INSTALL_DIR"/
  fi
  ok "Proyecto copiado."
fi

# ---------------------------------------------------------------------------
# 3. Configuracion: backend/.env
# ---------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/backend/.env"

if [ -f "$ENV_FILE" ]; then
  ok "Se conserva el $ENV_FILE existente (no se sobrescribe)."
else
  info "Creando $ENV_FILE con un JWT_SECRET aleatorio..."
  cp "$INSTALL_DIR/backend/.env.example" "$ENV_FILE"

  SECRET="$(openssl rand -hex 32)"
  # El delimitador | evita conflictos con caracteres del secreto.
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" "$ENV_FILE"

  # El .env guarda un secreto: solo root debe poder leerlo.
  chmod 600 "$ENV_FILE"
  ok "Archivo .env creado (permisos 600) con un secreto de 256 bits."
  warn "Revisa ALLOWED_SERVICES en $ENV_FILE antes de la demostracion."
fi

# ---------------------------------------------------------------------------
# 4. Instalar la unit de systemd
# ---------------------------------------------------------------------------
info "Instalando $UNIT_NAME ..."
install -m 644 "$SCRIPT_DIR/$UNIT_NAME" "$UNIT_DIR/$UNIT_NAME"

# daemon-reload: systemd cachea las units en memoria; sin esto no veria los
# cambios del archivo que acabamos de copiar.
systemctl daemon-reload

# enable --now = enable (arranque en cada boot) + start (arrancar ya).
info "Habilitando y arrancando el servicio (la primera vez construye las imagenes; puede tardar varios minutos)..."
systemctl enable --now "$UNIT_NAME"

# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------
echo
systemctl --no-pager --lines=0 status "$UNIT_NAME" || true
echo

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
ok "Instalacion completada."
echo
echo "  Panel:     http://${IP:-<IP-del-host>}/"
echo "  API:       http://${IP:-<IP-del-host>}:8000/api/health"
echo "  Usuarios:  admin / Admin2026!     viewer / Viewer2026!"
echo
echo "  Gestion:   sudo systemctl {start|stop|restart|status} panel-web"
echo "  Logs:      journalctl -u panel-web -f"
echo "             docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo
