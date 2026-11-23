#!/usr/bin/env bash
# =============================================================================
# Instalación de GruaLink en un servidor en la nube (VPS) con Ubuntu 24.04 LTS
# =============================================================================
#
# Instala TODO lo necesario en un servidor nuevo y deja GruaLink funcionando
# con HTTPS:
#   - Node.js, PostgreSQL 18 y Caddy (proxy HTTPS con certificado automático)
#   - Firewall (solo SSH, HTTP y HTTPS), actualizaciones de seguridad automáticas
#   - Base de datos con dos usuarios: dueño (migraciones/respaldos) y
#     grualink_app (permisos mínimos, el que usa la API)
#   - GruaLink como servicio (arranca solo y se reinicia si falla)
#   - Respaldo diario de la base a las 23:30 (hora de Colombia)
#
# ANTES de ejecutarlo:
#   1. El subdominio (ej. grualink.sotrandes.com) debe apuntar a la IP del
#      servidor (registro DNS tipo A). Sin eso, Caddy no obtiene el certificado.
#
# Uso (conectado por SSH al servidor, como root):
#   curl -fsSL https://raw.githubusercontent.com/Reyner25/GruaLink/main/deploy/linux/instalar.sh -o instalar.sh
#   sudo bash instalar.sh grualink.sotrandes.com
#
# Se puede volver a ejecutar sin peligro: lo que ya está hecho no se repite y
# NO se borran datos ni se cambian contraseñas existentes.
# =============================================================================
set -euo pipefail

DOMINIO="${1:-}"
REPO="${GRUALINK_REPO:-https://github.com/Reyner25/GruaLink.git}"
RAMA="${GRUALINK_RAMA:-main}"
NODE_MAJOR="${NODE_MAJOR:-24}"
PG_MAJOR=18
APP_DIR=/opt/grualink            # código (repositorio)
HOME_DIR=/var/lib/grualink       # carpeta personal del usuario del servicio
RESPALDOS_DIR=/var/backups/grualink
USUARIO=grualink                 # usuario de Linux que ejecuta la app
BASE=GruaLink
ROL_DUENO=grualink_dueno
ROL_APP=grualink_app
ENV_FILE="$APP_DIR/backend/.env"

paso() { echo; echo "==> $*"; }
falla() { echo "✖ $*" >&2; exit 1; }
como_app() { sudo -u "$USUARIO" -H "$@"; }
clave_aleatoria() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; }

# ---------------------------------------------------------------- comprobaciones
[ "$(id -u)" -eq 0 ] || falla "Ejecute como root: sudo bash instalar.sh <dominio>"
[ -n "$DOMINIO" ] || falla "Falta el dominio. Ejemplo: sudo bash instalar.sh grualink.sotrandes.com"
[[ "$DOMINIO" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || falla "Dominio inválido: $DOMINIO"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || falla "Este script es para Ubuntu (encontrado: ${PRETTY_NAME:-desconocido})"

echo "Instalando GruaLink en $PRETTY_NAME para https://$DOMINIO"

# ---------------------------------------------------------------- sistema
paso "Zona horaria America/Bogota (respaldos y registros en hora de Colombia)"
timedatectl set-timezone America/Bogota

paso "Memoria de intercambio (swap) para compilar la app en servidores pequeños"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  swap de 2 GB creado"
else
  echo "  ya existe swap"
fi

paso "Actualizando el sistema e instalando herramientas básicas"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt-get update -q
apt-get upgrade -yq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold
apt-get install -yq curl ca-certificates gnupg git ufw openssl build-essential \
  unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https

paso "Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Puerto real de SSH (si el proveedor lo cambió, no quedarse por fuera)
SSH_PUERTO="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}' || true)"
SSH_PUERTO="${SSH_PUERTO:-22}"
paso "Firewall: solo SSH ($SSH_PUERTO), HTTP (80) y HTTPS (443)"
ufw allow "$SSH_PUERTO/tcp" >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null   # tcp y udp (HTTP/3)
ufw --force enable >/dev/null
ufw status | sed 's/^/  /'

# ---------------------------------------------------------------- programas
paso "Node.js $NODE_MAJOR (repositorio oficial de NodeSource)"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -yq nodejs
fi
echo "  node $(node -v), npm $(npm -v)"

paso "PostgreSQL $PG_MAJOR (repositorio oficial de PostgreSQL)"
if [ ! -x "/usr/lib/postgresql/$PG_MAJOR/bin/postgres" ]; then
  apt-get install -yq postgresql-common
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -yq "postgresql-$PG_MAJOR"
fi
systemctl enable --now postgresql
echo "  $(sudo -u postgres psql -tAc 'SELECT version()' | cut -d, -f1)"

paso "Caddy (HTTPS con certificado gratuito que se renueva solo)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi
echo "  $(caddy version)"

# ---------------------------------------------------------------- código
paso "Usuario del sistema '$USUARIO' y código en $APP_DIR"
id "$USUARIO" >/dev/null 2>&1 || useradd --system --home-dir "$HOME_DIR" --create-home --shell /usr/sbin/nologin "$USUARIO"
install -d -o "$USUARIO" -g "$USUARIO" -m 755 "$APP_DIR"
install -d -o "$USUARIO" -g "$USUARIO" -m 700 "$RESPALDOS_DIR"
if [ -d "$APP_DIR/.git" ]; then
  como_app git -C "$APP_DIR" pull --ff-only
else
  como_app git clone --branch "$RAMA" "$REPO" "$APP_DIR"
fi
echo "  versión: $(como_app git -C "$APP_DIR" log -1 --format='%h %s')"

# ---------------------------------------------------------------- base de datos
paso "Base de datos '$BASE' y sus usuarios"
PRIMERA_VEZ=no
if [ -f "$ENV_FILE" ]; then
  echo "  $ENV_FILE ya existe: se conservan la base y las contraseñas actuales"
else
  PRIMERA_VEZ=si
  CLAVE_DUENO="$(clave_aleatoria)"
  CLAVE_APP="$(clave_aleatoria)"
  # Las contraseñas van dentro del texto que recibe psql (no en la línea de
  # comandos, que otros usuarios del servidor podrían ver). Solo tienen
  # letras y números, y además psql las escapa con :'variable' + %L.
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
\set clave_dueno '$CLAVE_DUENO'
\set clave_app '$CLAVE_APP'
SELECT format('CREATE ROLE $ROL_DUENO LOGIN PASSWORD %L', :'clave_dueno')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROL_DUENO') \gexec
SELECT format('ALTER ROLE $ROL_DUENO PASSWORD %L', :'clave_dueno') \gexec
SELECT format('CREATE ROLE $ROL_APP LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'clave_app')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROL_APP') \gexec
SELECT format('ALTER ROLE $ROL_APP PASSWORD %L', :'clave_app') \gexec
SELECT 'CREATE DATABASE "$BASE" OWNER $ROL_DUENO'
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$BASE') \gexec
REVOKE CONNECT ON DATABASE "$BASE" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$BASE" TO $ROL_DUENO;
SQL

  paso "Archivo de configuración $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Generado por deploy/linux/instalar.sh el $(date '+%Y-%m-%d %H:%M').
# Contiene contraseñas: solo lo puede leer el usuario $USUARIO (y root).
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
DATABASE_URL=postgres://$ROL_APP:$CLAVE_APP@localhost:5432/$BASE
DATABASE_URL_ADMIN=postgres://$ROL_DUENO:$CLAVE_DUENO@localhost:5432/$BASE
SESSION_TTL_HORAS=12
TRUST_PROXY=loopback
SITIO_HTTPS=true
RESPALDOS_DIR=$RESPALDOS_DIR
RESPALDOS_CONSERVAR=30
PG_BIN=/usr/lib/postgresql/$PG_MAJOR/bin
EOF
  umask 022
  chown "$USUARIO:$USUARIO" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  unset CLAVE_DUENO CLAVE_APP
fi

# ---------------------------------------------------------------- compilar
paso "Dependencias del backend"
como_app bash -c "cd '$APP_DIR/backend' && npm ci --omit=dev --no-audit --no-fund"

paso "Compilando la app web (puede tardar unos minutos)"
como_app bash -c "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"

paso "Estructura de la base (migraciones) y permisos de $ROL_APP"
como_app bash -c "cd '$APP_DIR/backend' && npm run --silent migrate && node scripts/crear-usuario-app.js --solo-permisos"

if [ "$PRIMERA_VEZ" = si ]; then
  paso "Catálogos y tarifas iniciales (sin usuarios de prueba)"
  # Con el usuario dueño: dotenv no reemplaza una variable que ya existe
  como_app bash -c "cd '$APP_DIR/backend' && DATABASE_URL=\"\$(grep '^DATABASE_URL_ADMIN=' .env | cut -d= -f2-)\" npm run --silent datos-iniciales"
fi

# ---------------------------------------------------------------- servicios
paso "Servicio de GruaLink y respaldo diario (systemd)"
install -m 644 "$APP_DIR/deploy/linux/grualink.service" /etc/systemd/system/grualink.service
install -m 644 "$APP_DIR/deploy/linux/grualink-respaldo.service" /etc/systemd/system/grualink-respaldo.service
install -m 644 "$APP_DIR/deploy/linux/grualink-respaldo.timer" /etc/systemd/system/grualink-respaldo.timer
systemctl daemon-reload
systemctl enable grualink grualink-respaldo.timer >/dev/null
systemctl restart grualink
systemctl start grualink-respaldo.timer

echo -n "  esperando que GruaLink responda"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/salud >/dev/null 2>&1; then echo " ✔"; break; fi
  echo -n "."; sleep 1
done
curl -fsS http://127.0.0.1:4000/api/salud >/dev/null 2>&1 \
  || falla "GruaLink no responde. Revise el registro con: journalctl -u grualink -n 50"

paso "HTTPS con Caddy para $DOMINIO"
sed "s/__DOMINIO__/$DOMINIO/g" "$APP_DIR/deploy/linux/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy || systemctl restart caddy

IP_DNS="$(getent ahostsv4 "$DOMINIO" | awk 'NR==1{print $1}' || true)"
if [ -z "$IP_DNS" ]; then
  echo "  ⚠ $DOMINIO todavía no resuelve a ninguna IP. Cree el registro DNS tipo A;"
  echo "    Caddy obtendrá el certificado solo en cuanto el dominio apunte aquí."
elif ! hostname -I | tr ' ' '\n' | grep -qx "$IP_DNS"; then
  echo "  ⚠ $DOMINIO apunta a $IP_DNS. Si esa no es la IP pública de este servidor,"
  echo "    corrija el registro DNS (algunos proveedores no muestran la IP pública aquí)."
else
  echo "  ✔ $DOMINIO apunta a este servidor ($IP_DNS)"
fi

# ---------------------------------------------------------------- administrador
if [ "$PRIMERA_VEZ" = si ]; then
  paso "Primer administrador de GruaLink"
  como_app bash -c "cd '$APP_DIR/backend' && node scripts/crear-admin.js" \
    || echo "  ⚠ No se creó el administrador. Hágalo luego con: cd $APP_DIR/backend && sudo -u $USUARIO -H node scripts/crear-admin.js"
fi

cat <<EOF

=============================================================================
 ✔ GruaLink instalado:  https://$DOMINIO
=============================================================================
 Estado:        systemctl status grualink
 Registro:      journalctl -u grualink -f
 Salud:         curl https://$DOMINIO/api/salud
 Respaldos:     $RESPALDOS_DIR  (todos los días 23:30; se conservan 30)
                Respaldo ahora: sudo systemctl start grualink-respaldo
 Actualizar:    sudo bash $APP_DIR/deploy/linux/actualizar.sh
 Configuración: $ENV_FILE  (contraseñas de la base; no lo comparta)
=============================================================================
EOF
