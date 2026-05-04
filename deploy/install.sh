#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd -P)"
APP_USER="${SUDO_USER:-$USER}"
APP_GROUP="$(id -gn "$APP_USER")"

echo "==> Installing CLEP for user='$APP_USER' at '$APP_DIR'"

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y python3-venv git avahi-daemon

echo "==> Creating virtualenv + installing Python deps"
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt

echo "==> Rendering systemd units"
render() {
  sed -e "s|@APP_DIR@|${APP_DIR}|g" \
      -e "s|@APP_USER@|${APP_USER}|g" \
      -e "s|@APP_GROUP@|${APP_GROUP}|g" \
      "deploy/$1"
}
render clep.service        | sudo tee /etc/systemd/system/clep.service        >/dev/null
render clep-update.service | sudo tee /etc/systemd/system/clep-update.service >/dev/null
sudo install -m 644 deploy/clep-update.timer /etc/systemd/system/clep-update.timer

echo "==> Allowing $APP_USER to restart clep.service without password"
echo "$APP_USER ALL=(root) NOPASSWD: /bin/systemctl restart clep.service" \
  | sudo tee /etc/sudoers.d/clep-restart >/dev/null
sudo chmod 440 /etc/sudoers.d/clep-restart

echo "==> Enabling + starting services"
sudo systemctl daemon-reload
sudo systemctl enable --now avahi-daemon
sudo systemctl enable --now clep.service
sudo systemctl enable --now clep-update.timer

echo "==> Done. Status:"
sudo systemctl --no-pager status clep.service clep-update.timer | head -30
echo
echo "Reach the app at http://clep.local:5000 (mDNS publish from app.py)"
