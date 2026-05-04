#!/usr/bin/env bash
# Idempotent installer for the nginx server block that routes clep.local to
# the Flask app on :5000, plus a systemd unit that publishes clep.local and
# printvault.local as mDNS aliases of this host. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Ensuring avahi-utils and nginx are installed"
sudo apt-get install -y avahi-utils nginx

echo "==> Installing nginx site: clep.local -> 127.0.0.1:5000"
sudo install -m 644 deploy/nginx-clep.conf /etc/nginx/sites-available/clep
sudo ln -sf /etc/nginx/sites-available/clep /etc/nginx/sites-enabled/clep
sudo nginx -t
sudo systemctl reload nginx

echo "==> Installing mdns-aliases.service"
sudo install -m 644 deploy/mdns-aliases.service /etc/systemd/system/mdns-aliases.service
sudo systemctl daemon-reload
sudo systemctl enable --now mdns-aliases.service

echo "==> Sanity check"
sleep 1
curl -sI -H 'Host: clep.local'        http://127.0.0.1/ | head -1 || true
curl -sI -H 'Host: printvault.local'  http://127.0.0.1/ | head -1 || true
echo
echo "==> Done. clep.local -> CLEP, printvault.local -> PrintVault."
