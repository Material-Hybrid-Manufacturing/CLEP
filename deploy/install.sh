#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y python3-venv git avahi-daemon

echo "==> Setting hostname to clep"
sudo hostnamectl set-hostname clep

echo "==> Creating virtualenv + installing Python deps"
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt

echo "==> Installing systemd units"
sudo install -m 644 deploy/clep.service        /etc/systemd/system/clep.service
sudo install -m 644 deploy/clep-update.service /etc/systemd/system/clep-update.service
sudo install -m 644 deploy/clep-update.timer   /etc/systemd/system/clep-update.timer

echo "==> Allowing pi to restart clep.service without password"
echo 'pi ALL=(root) NOPASSWD: /bin/systemctl restart clep.service' \
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
echo "Reach the app at http://clep.local:5000"
