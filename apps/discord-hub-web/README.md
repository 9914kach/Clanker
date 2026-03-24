# Discord hub — frontend (`discord-hub-web`)

Vite + React + TypeScript för discord-gängets gemensamma verktyg. **UI:** Tailwind CSS v4, shadcn/ui via **`@clanker/ui`** (`packages/ui/`), och **Framer Motion**. Nya komponenter från shadcn: `npx shadcn@latest add …` (konfiguration i `components.json`).

För **personliga / allmänna dev-verktyg** (t.ex. dokumentationsviewer) finns en separat app: `apps/dev-tools-web/`.

## Utveckling

Från repots rot:

```bash
npm install
npm run dev
```

Öppna den URL Vite skriver ut (vanligtvis `http://localhost:5173`).

## Miljövariabler

Kopiera `.env.example` till `.env` i denna mapp vid behov. `VITE_API_URL` används när backend ligger på annan bas-URL; annars lämna tom och använd `/api` (Vite proxar till `127.0.0.1:3001` i utveckling).

## Produktion på Pi

```bash
cd ~/apps/Clanker
docker compose --profile discord up -d --build discord-hub-web
```

Sidan når du på `http://<pi-ip>:4173` (eller porten du sätter med `DISCORD_HUB_WEB_PORT` i `.env`).

**Valfritt i repot:** Compose-profilen **`caddy`** (`clanker-caddy`, [infra/caddy/Caddyfile](../../infra/caddy/Caddyfile)) proxar till denna container via värdnamn (t.ex. port 80) — se [docs/docker.md](../../docs/docker.md#caddy-reverse-proxy).

Annars för TLS/domän utanför Compose: egen **Caddy** eller **nginx** på värden, eller reverse proxy på routern, med certifikat mot din domän.

## Databas

PostgreSQL startas separat med profilen `db` (se rot-`docker-compose.yml`). Anslutningssträng för API på samma Docker-värd: `postgresql://USER:PASS@clanker-db:5432/DB`.
