#!/usr/bin/env bash
# Aktivera sparse checkout så arbetskatalogen bara innehåller Pi-hole (Compose) + discord-bot.
# .gitignore kan inte dölja spårade filer vid clone/pull — det här minskar vad som finns på disk på Pi:n.
#
# Kräver: git 2.25+ (sparse-checkout). Botten byggs med npm i bots/discord-bot (inte npm i monoreporoten).
#
# Användning (befintlig full clone):
#   ./scripts/git-sparse-checkout-pi-bot-pihole.sh -y
#
# Miljö: SPARSE_PI_BOT_PIHOLE_YES=1 samma effekt som -y (t.ex. i skript).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "git-sparse-checkout-pi-bot-pihole: kör från en git-clone av Clanker." >&2
  exit 1
}
cd "$REPO_ROOT"

if [[ "${1:-}" != "-y" && "${SPARSE_PI_BOT_PIHOLE_YES:-}" != "1" ]]; then
  cat >&2 <<'EOF'
Aktiverar sparse checkout: allt utom docker-compose + .env-mall + bots/discord-bot + detta skript
försvinner från arbetskatalogen (finns kvar i git; återställ med: git sparse-checkout disable).

Spara ocommittat arbete först. Kör:
  ./scripts/git-sparse-checkout-pi-bot-pihole.sh -y
EOF
  exit 1
fi

git sparse-checkout init --no-cone
git sparse-checkout set \
  docker-compose.yml \
  .env.example \
  .gitignore \
  bots/discord-bot/ \
  scripts/git-sparse-checkout-pi-bot-pihole.sh

echo "Sparse checkout klar."
echo "Pi-hole: docker compose up -d clanker-pihole"
echo "Bot:     cd bots/discord-bot && npm install && npm run build && npm run start"
