#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p backups

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="backups/pihole-config-${STAMP}.tar.gz"

echo "[INFO] Skapar backup: ${ARCHIVE}"

tar -czf "${ARCHIVE}" \
  docker-compose.yml \
  .env.example \
  README_PIHOLE.md \
  RASPBERRY_PIHOLE_BASICS.md \
  PIHOLE_5_DAGAR_STATUSCHECK.md \
  pihole-healthcheck.sh \
  pihole-healthcheck.ps1 \
  etc-pihole/pihole.toml \
  etc-pihole/adlists.list \
  etc-pihole/dnsmasq.conf \
  etc-pihole/hosts \
  etc-dnsmasq.d \
  scripts \
  .gitignore

echo "[INFO] Backup klar: ${ARCHIVE}"
echo "[INFO] Testa restore genom: tar -tzf ${ARCHIVE} | head"
