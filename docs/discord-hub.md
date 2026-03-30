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

## Felsökning: efter Discord-inloggning („gateway”, 502, OAuth dog)

Många ser **502 Bad Gateway** eller en tom/felande sida **efter** att de klickat „Godkänn” hos Discord. Det är i nästan alla fall **inte** Discord Gateway (WebSocket) utan att **webbläsarens anrop till hub-API:t misslyckas**.

1. **Kör API samtidigt som Vite**  
   I dev proxar Vite `/api` → `http://127.0.0.1:3001` (eller port från `DISCORD_HUB_API_DEV_PORT` / `PORT` i **repots** `.env`). Om **discord-hub-api** inte är igång får du **502** på callback-URL:en (`/api/auth/discord/callback`).  
   Använd t.ex. `npm run dev:discord-stack:local` från roten, eller två terminaler: `npm run dev:discord-api` + `npm run dev -w discord-hub-web`.

2. **Samma port i hela kedjan**  
   Om du ändrat `PORT` för API måste **samma** värde ligga i rot-`.env` som `DISCORD_HUB_API_DEV_PORT` (så Vite proxyn pekar rätt). Annars: 502 trots att API kör.

3. **`DISCORD_REDIRECT_URI` och `FRONTEND_URL` måste stämma med hur ni öppnar sidan**  
   Kopiera inte någon annans `.env` rakt av: **localhost vs 127.0.0.1**, **port** (standard Vite 5173, men **5175** i `--mode direct`), och ev. **Caddy** (`http://dev.clanker.discord`) måste vara **identiska** i tre ställen: din `.env`, **Discord Developer Portal → OAuth2 → Redirects**, och adressfältet i webbläsaren. Fel redirect ger Discords eget fel; fel host/port kan ge 502 om inget lyssnar där.

4. **`COOKIE_SECURE` och HTTP**  
   Kör du API med `NODE_ENV=production` över **http://** kan säkra cookies strippas och du landar på `/login?error=oauth` („inloggningen dog”). Sätt `COOKIE_SECURE=0` i den miljön eller använd HTTPS.

---

**„Gateway” på dashboarden** (badge „frånkopplad” / varningstext) är **Discord WebSocket** för live röst m.m.: kräver `DISCORD_BOT_TOKEN` och `DISCORD_GATEWAY_GUILD_IDS` som innehåller **samma guild** som `VITE_DISCORD_HUB_GUILD_ID`. Det är **ortogonalt** mot OAuth.

**Viktigt:** bara **en** process åt gången får köra **Gateway** med samma bot-token (t.ex. inte både din maskin och polarens med samma `DISCORD_BOT_TOKEN` + gateway-guilds — då konkurrerar de och anslutningen blir ostadig).

## Musikbot (`discord-hub` + musik i webben)

Webb + **discord-hub-api** räcker **inte** för kö/playback. Då behövs även **`discord-bot`** (samma repo, egen Node-process) som pratar med Discord-röst och exponerar HTTP på port **3012** (standard).

1. **`MUSIC_BOT_HTTP_URL` i API-miljön** (t.ex. repots `.env` eller `apps/discord-hub-api/.env`):  
   `http://127.0.0.1:3012` när bot och API körs lokalt på samma dator. Utan denna variabel svarar API med **503** / „Music bot not configured”.

2. **Starta botten:** från roten `npm run dev:discord-bot` (eller `npm run bot:dev` / Docker enligt `docs/docker.md`). I terminalen ska den bli **Ready** och lyssna på musik-HTTP-porten.

3. **`DATABASE_URL`** för **både** hub-api och discord-bot mot **samma** Postgres (kö + `now_playing` ligger i DB). Kör migrationer om det saknas tabeller.

4. **`bots/discord-bot/.env`:** `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DATABASE_URL` (samma som hubben). Valfritt: Spotify-nycklar om ni använder Spotify.

5. **Röst i Discord:** användaren som köar musik ska vara **i en röstkanal**; bot-rollen behöver **Connect** + **Speak** (och ev. **Use Voice Activity**). På **Windows** med bot i **Docker Desktop** fungerar röst ofta **inte** (UDP/bridge) — kör botten med **`npm run dev:discord-bot` på värden** i stället, eller `discord-bot-host` på Linux/Pi (`docs/docker.md`).

6. **`VITE_DISCORD_HUB_GUILD_ID`** i webbens `.env` måste vara er servers guild-id om musiksidan/widgeten ska veta vilken server det gäller.

### Flera hubbar, en musikbot, olika Postgres på hub-api

Kommandon (play/skip/…) går alltid till **discord-bot**. **Kö och nu spelas** läses också från **botens** databas när `MUSIC_BOT_HTTP_URL` är satt — då behöver hub-api **inte** dela `DATABASE_URL` med botten bara för att visa musik. Spellistor, voice-snapshot i DB m.m. följer fortfarande **respektive** hub-api:s Postgres om ni inte synkar den.

**Discord Gateway** (live voice i hubben) tillåter **inte** två samtidiga anslutningar med **samma bot-token**. Låt bara **en** `discord-hub-api` köra med `DISCORD_GATEWAY_GUILD_IDS` satt; på övriga instanser: lämna gateway-listan tom (voice-widgeten blir begränsad men OAuth/musik via delad musikbot kan fungera).

För att en **annan dator** ska nå musik-HTTP: sätt `MUSIC_BOT_HTTP_BIND=0.0.0.0` på bot-värden, öppna brandvägg till `MUSIC_BOT_HTTP_PORT`, och sätt polarens `MUSIC_BOT_HTTP_URL` till `http://<din-lan-ip>:3012` (byt port om ni ändrat den).

## Data & persistens

När `DATABASE_URL` är satt:
- Profiler, League‑koppling och snapshots lagras i Postgres.
- Migrationer i `apps/discord-hub-api/migrations/` körs **automatiskt vid start** av **discord-hub-api** och **discord-bot** (redan applicerade versioner hoppas över via `public.schema_migrations`). Du kan fortfarande köra manuellt:

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
