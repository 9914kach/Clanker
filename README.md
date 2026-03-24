# Clanker

Homeserver-repo för Raspberry Pi (Clanker) — skript, anteckningar och tjänster som Pi-hole.

- **Remote:** [github.com/9914kach/Clanker](https://github.com/9914kach/Clanker)

## Struktur (växer efter behov)

| Sökväg | Innehåll |
|--------|----------|
| `apps/discord-hub-web/` | Frontend för **discord-hubben** (Vite + React + TS, Tailwind + shadcn + Motion) — se `apps/discord-hub-web/README.md` |
| `apps/discord-hub-api/` | Backend för samma hub — se `apps/discord-hub-api/README.md` |
| `apps/dev-tools-web/` | **Lokala dev-verktyg** (dokumentationsviewer m.m., separat från discord-hub; samma UI-grund som discord-hub) — **start:** se [apps/dev-tools-web/README.md](apps/dev-tools-web/README.md) (`npm run dev:tools`, eller `npm run dev:all` tillsammans med discord-hub; Docker-profil `devtools`) |
| `packages/ui/` | Delat **`@clanker/ui`** — shadcn/ui-primitives som båda webapparna importerar |
| `experiments/` | Isolerade försök och engångsskript |
| `pihole/` | Dokumentation och skript för Pi-hole (själva Compose-filen ligger i repots rot) |
| `docs/homelab-todo.md` | Backlog / TODO för homelab (VM, domän, osv.) |
| `docs/docker.md` | **Docker Compose** — vanliga kommandon, profiler och exempel för Clanker |
| `infra/caddy/` | Valfri **Caddy**-reverse proxy (HTTP, profil `caddy`) — detaljer i [docs/docker.md](docs/docker.md#caddy-reverse-proxy) |

En framtida **server-/homelab-dashboard** kan få egna mappar, t.ex. `apps/clanker-hub-web` / `apps/clanker-hub-api`, och en egen Compose-profil — så den inte blandas ihop med discord-hubben.

## Docker Compose: var du kör ifrån

**Alla `docker compose`-kommandon körs från repots rot** (mappen där denna `README.md` och `docker-compose.yml` ligger). Då pekar volymsökvägar som `./etc-pihole` och `./etc-dnsmasq.d` rätt. För ett kommando som alltid använder rätt katalog: **`scripts/clanker`** (dispatcher: `help`, `run`, `kill`, `up`, `stop`, `compose`, `ps`) — valfritt symlink `clanker` i `PATH`; även `scripts/clanker-run` (`clanker.run`) och `scripts/clanker-kill` (`clanker.kill`) — profiler via `COMPOSE_PROFILES` i `.env`; valfritt **`CLANKER_VITE_DEV=1`** startar/stoppar även `npm run dev:all` (Vite) i bakgrunden. **`clanker-kill`** kör som standard **`docker compose down`** och stoppar därmed **Pi-hole**; utan sekundär DNS i routern slutar DNS för klienter som bara pekar på Pi. Vill du bara stänga webb/caddy/db men behålla DNS, sätt **`CLANKER_KILL_KEEP_PIHOLE=1`** i `.env` (se [docs/docker.md](docs/docker.md)). Undermappar som `pihole/` innehåller guider och hjälpskript — inte en egen compose-fil. Färdiga exempel och kommandoöversikt: [docs/docker.md](docs/docker.md).

När du lägger till fler tjänster kan varje app få en egen undermapp (`pihole/`, `din-webbapp/`, …) med dokumentation, medan antingen (a) en gemensam `docker-compose.yml` i roten växer, eller (b) varje tjänst har `docker-compose.yml` i sin mapp och du kör `docker compose -f <mapp>/docker-compose.yml` från rot med korrekta volymsökvägar — spika ett mönster per tjänst och skriv det i respektive README.

## Ny Pi eller ren installation (kort checklista)

1. Installera Docker (och Compose-plugin) på Pi.
2. `git clone` detta repo till t.ex. `~/apps/Clanker` och `cd` dit.
3. Kopiera `.env.example` till `.env` och justera värden (inga hemligheter i git).
4. `docker compose pull` och `docker compose up -d`.
5. Återställ **persistent data** om du har backup (t.ex. `etc-pihole/`) — compose skapar containrar, inte nödvändigtvis all historik.

## Krav

Beror på respektive del; dokumentera modell av Pi, OS-version och ev. Python/venv i varje undermapp när det spelar roll.
