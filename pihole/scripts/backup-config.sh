#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p backups

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="backups/pihole-config-${STAMP}.tar.gz"

echo "[INFO] Skapar backup: ${ARCHIVE}"

tar --ignore-failed-read -czf "${ARCHIVE}" \
  docker-compose.yml \
  .env.example \
  README.md \
  pihole/README_PIHOLE.md \
  pihole/RASPBERRY_PIHOLE_BASICS.md \
  pihole/PIHOLE_5_DAGAR_STATUSCHECK.md \
  pihole/GIT_RECOVERY_GUIDE.md \
  pihole/pihole-healthcheck.sh \
  pihole/pihole-healthcheck.ps1 \
  etc-pihole/pihole.toml \
  etc-pihole/adlists.list \
  etc-pihole/dnsmasq.conf \
  etc-pihole/hosts \
  etc-dnsmasq.d \
  pihole/scripts \
  pihole/.gitignore \
  .gitignore

echo "[INFO] Backup klar: ${ARCHIVE}"
echo "[INFO] Testa restore genom: tar -tzf ${ARCHIVE} | head"
