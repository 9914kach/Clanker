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

**OAuth / inloggning:** `discord-hub-api` måste lyssna på **port 3001** (Vite proxar `/api` dit). Antingen `npm run dev:discord-stack` från repots rot (API + webb i samma terminal), eller `npm run dev:discord-api` i en terminal och `npm run dev` i en annan. `clanker dev discord` kör `dev:discord-stack` efter `clanker up` (så båda startar). Se [apps/discord-hub-api/README.md](../discord-hub-api/README.md) för Discord-app, `DISCORD_REDIRECT_URI` och `.env`. Med **Caddy** (`http://dev.clanker.discord`) ska `DISCORD_REDIRECT_URI` och `FRONTEND_URL` använda den hosten, inte `localhost`. Hubben redirectar till `/login` tills `GET /api/auth/me` svarar OK.

**Inloggad vy:** standardroute är **`/dashboard`** (root `/` redirectar dit). Profilbanner och accentfärg kommer från Discord via `GET /api/auth/me` och laddas från **Discords CDN** (`cdn.discordapp.com`); inga extra hemligheter behövs. **League-koppling och synk**, **profil-kryssrutor** och **Tema och färger** når du via **`/profile/settings`**, som du öppnar från **din egen publika profil** (`/u/:userId`, knappen *Profilinställningar*) — inte från huvudmenyn. **Rank och senaste matcher** visas på den publika profilen efter lyckad synk.

För **både** discord-hub och `dev-tools-web` i samma terminal (t.ex. Caddy och `http://dev.clanker.discord` + `http://dev.clanker.tools`): `npm run dev:all` från roten.

**Caddy / `http://dev.clanker.discord`:** om sidan blir grå, sätt **`VITE_HMR_CLIENT_PORT=80`** i repots rot-`.env` och starta om Vite (`npm run dev` eller `npm run dev:all`). Se [docs/docker.md](../../docs/docker.md#caddy-reverse-proxy).

## Miljövariabler

Kopiera `.env.example` till `.env` i denna mapp vid behov. `VITE_API_URL` används när backend ligger på annan bas-URL; annars lämna tom och använd `/api` (Vite proxar till `127.0.0.1:3001` i utveckling). **`VITE_DISCORD_HUB_GUILD_ID`** (guild snowflake) aktiverar bot-/gateway-widgeten på dashboard; API måste ha `DISCORD_BOT_TOKEN` och ev. `DISCORD_HUB_ALLOWED_GUILD_IDS` / `DISCORD_GATEWAY_GUILD_IDS` — se [apps/discord-hub-api/README.md](../discord-hub-api/README.md).

## Produktion på Pi

```bash
cd ~/apps/Clanker
docker compose --profile discord up -d --build discord-hub-web
```

Sidan når du på `http://<pi-ip>:4173` (eller porten du sätter med `DISCORD_HUB_WEB_PORT` i `.env`).

**Valfritt i repot:** Compose-profilen **`caddy`** (`clanker-caddy`, [infra/caddy/Caddyfile](../../infra/caddy/Caddyfile)) proxar till denna container via värdnamn (t.ex. port 80) — se [docs/docker.md](../../docs/docker.md#caddy-reverse-proxy).

Annars för TLS/domän utanför Compose: egen **Caddy** eller **nginx** på värden, eller reverse proxy på routern, med certifikat mot din domän.

## Databas

PostgreSQL startas separat med profilen `db` (se rot-`docker-compose.yml`). API i **samma Compose-nät**: `postgresql://USER:PASS@clanker-db:5432/clanker_discord` (eller ditt `POSTGRES_DB`). API på **annan värd** (t.ex. Pi mot Postgres på desktop): `DATABASE_URL` med desktopens LAN-IP — se [PostgreSQL på workstation (LAN)](../../docs/docker.md#postgresql-på-workstation-lan).
