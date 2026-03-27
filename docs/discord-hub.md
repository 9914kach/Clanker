# Discord hub — översikt & drift

Den här sidan beskriver **discord-hubben** i Clanker‑repot: hur delarna hänger ihop, hur du kör lokalt och vilka filer som är “ingångar” när du ska ändra beteende.

Relaterade detaljer:
- Frontend‑README: `apps/discord-hub-web/README.md`
- Backend‑README: `apps/discord-hub-api/README.md`
- Shell‑klassning: `apps/discord-hub-web/docs/development/shell-entity-classification.md`
- Arkitektur: `docs/discord-hub-architecture.md`

## Delar i systemet

**Frontend (`discord-hub-web`)**
- Vite + React + TypeScript.
- UI: Tailwind v4 + shadcn/ui via `@clanker/ui`.
- Router: React Router.

**Backend (`discord-hub-api`)**
- Hono‑API för OAuth, profiler, bot‑proxy och League‑sync.
- `GET /api/auth/me` används av webben för session/profil.

**Valfritt**
- `apps/discord-bot` finns som separat tjänst (om/when du behöver den).

## Katalogkarta (snabba ingångar)

**Frontend**
- `apps/discord-hub-web/src/components/HubLayout.tsx` — topp‑layout, shell, tabs, nav, layout‑edit.
- `apps/discord-hub-web/src/pages/` — routade vyer (dashboard, profile, settings m.m.).
- `apps/discord-hub-web/src/lib/` — shell‑logik, storage, helpers.
- `apps/discord-hub-web/src/config/` — actions/tools och app‑konfig.
- `apps/discord-hub-web/src/i18n/` — all UI‑copy.

**Backend**
- `apps/discord-hub-api/src/index.ts` — huvudsakliga endpoints.
- `apps/discord-hub-api/src/discord-*.ts` — OAuth, proxy, gateway, bot‑REST.
- `apps/discord-hub-api/src/riot-lol.ts` — League‑integration.

## Utveckling (lokalt)

Från repots rot:

```bash
npm install
npm run dev:discord-api
npm run dev
```

Det här startar:
- API på `http://127.0.0.1:3001` (default).
- Vite för webben (defaultport från Vite).

### Körlägen för webben

Webb‑appen har två praktiska lägen:
- **Direct‑mode:** `npm run dev -w discord-hub-web -- --mode direct`  
  Port styrs av `VITE_DIRECT_PORT` (default **5175**).
- **Caddy‑mode:** `npm run dev -w discord-hub-web -- --mode caddy`  
  Använd när du kör via `http://dev.clanker.discord`.  
  Sätt `VITE_HMR_CLIENT_PORT=80` om HMR blir grå/trasig bakom Caddy.

`npm run dev:discord-stack:local` och `npm run dev:discord-stack:pi` i rot‑`package.json` startar API + web samtidigt.

## Portar & URL:er (standard)

- Web (dev): Vite defaultport (eller `VITE_DIRECT_PORT` i direct‑mode).
- API (dev): `3001` (`PORT` i API‑env).
- Web (docker/prod): `DISCORD_HUB_WEB_PORT` (default i `.env.example`: `4173`).

## Miljövariabler (minimalt för dev)

**API‑env** (se `apps/discord-hub-api/README.md` för hela listan):
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `FRONTEND_URL`
- `SESSION_SECRET`
- `DATABASE_URL` (valfri, men krävs för persistens)

**Web‑env**
- `VITE_API_URL` (tomt = `/api` via Vite‑proxy)
- `VITE_HMR_CLIENT_PORT` (endast för Caddy‑dev)

Alla exempel finns i `.env.example` i repots rot.

## Data & persistens

När `DATABASE_URL` är satt:
- Profiler, League‑koppling och snapshots lagras i Postgres.
- Migrationer i `apps/discord-hub-api/migrations/` körs via:

```bash
npm run migrate -w discord-hub-api
```

Utan DB svarar API:t med “available: false” för hub‑settings och returnerar begränsade profiler.

## När du ska ändra UI‑beteende

Snabb guide:
- **Shell / topbar / tabs:** `apps/discord-hub-web/src/components/HubLayout.tsx`
- **Drag/reorder i shell:** `apps/discord-hub-web/src/components/HubShellReorderableChrome.tsx`
- **Copy/labels:** `apps/discord-hub-web/src/i18n/hub-copy.ts`

## Produktionskörning (kort)

```bash
docker compose --profile discord up -d --build discord-hub-web
```

Vill du köra via Caddy‑domäner, se `docs/docker.md`.
