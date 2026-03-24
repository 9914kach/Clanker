#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    echo "[INFO] Skapade .env fran .env.example"
  else
    echo "[ERROR] Saknar .env och .env.example"
    exit 1
  fi
fi

mkdir -p etc-pihole etc-dnsmasq.d backups

echo "[INFO] Startar/aterstaller Pi-hole container..."
docker compose pull
docker compose up -d

echo "[INFO] Status:"
docker compose ps

echo "[INFO] Klar. Admin UI: http://<pi-ip>:8080/admin"
