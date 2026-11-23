#!/usr/bin/env bash
# =============================================================================
# Actualiza GruaLink en el servidor a la última versión publicada en GitHub.
#
# Uso (en el servidor, por SSH):
#   sudo bash /opt/grualink/deploy/linux/actualizar.sh
#
# Pasos: respaldo → descargar código → dependencias → migraciones →
#        permisos de grualink_app → compilar app web → reiniciar → verificar.
# Si algo falla se detiene; el respaldo del paso 1 permite volver atrás.
# =============================================================================
set -euo pipefail

APP_DIR=/opt/grualink
USUARIO=grualink
paso() { echo; echo "==> $*"; }
como_app() { sudo -u "$USUARIO" -H "$@"; }

[ "$(id -u)" -eq 0 ] || { echo "✖ Ejecute con sudo"; exit 1; }

paso "1. Respaldo de seguridad antes de actualizar"
systemctl start grualink-respaldo
journalctl -u grualink-respaldo -n 3 --no-pager -o cat | sed 's/^/  /'

paso "2. Descargando la versión nueva"
ANTES="$(como_app git -C "$APP_DIR" rev-parse --short HEAD)"
como_app git -C "$APP_DIR" pull --ff-only
DESPUES="$(como_app git -C "$APP_DIR" rev-parse --short HEAD)"
if [ "$ANTES" = "$DESPUES" ] && [ "${1:-}" != "--forzar" ]; then
  echo "  Ya estaba en la última versión ($DESPUES). Nada que hacer (use --forzar para recompilar)."
  exit 0
fi
como_app git -C "$APP_DIR" log --oneline "$ANTES..$DESPUES" | sed 's/^/  /'

paso "3. Dependencias, migraciones y permisos"
como_app bash -c "cd '$APP_DIR/backend' && npm ci --omit=dev --no-audit --no-fund && npm run --silent migrate && node scripts/crear-usuario-app.js --solo-permisos"

paso "4. Compilando la app web"
como_app bash -c "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"

# Si cambiaron los archivos de servicio, instalarlos
for f in grualink.service grualink-respaldo.service grualink-respaldo.timer; do
  if ! cmp -s "$APP_DIR/deploy/linux/$f" "/etc/systemd/system/$f"; then
    install -m 644 "$APP_DIR/deploy/linux/$f" "/etc/systemd/system/$f"
    echo "  actualizado /etc/systemd/system/$f"
  fi
done
systemctl daemon-reload

paso "5. Reiniciando GruaLink"
systemctl restart grualink
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/salud >/dev/null 2>&1; then
    echo "  ✔ GruaLink actualizado de $ANTES a $DESPUES y respondiendo"
    exit 0
  fi
  sleep 1
done
echo "✖ GruaLink no responde después de actualizar. Revise: journalctl -u grualink -n 50"
exit 1
