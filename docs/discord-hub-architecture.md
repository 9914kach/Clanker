# Discord hub — architecture

Det här dokumentet beskriver arkitekturen för **discord‑hubben** och hur data rör sig mellan web, API och externa tjänster.

Relaterat:
- Översikt: `docs/discord-hub.md`
- Frontend‑README: `apps/discord-hub-web/README.md`
- Backend‑README: `apps/discord-hub-api/README.md`

## Översikt (komponenter)

**Web**
- `apps/discord-hub-web/` — React/Vite frontend.
- Hämtar användarprofil och app‑data via `/api/...`.

**API**
- `apps/discord-hub-api/` — Hono‑API.
- Hanterar OAuth, proxys till Discord, League‑sync, bot‑summary, optional Gateway.

**Databas**
- PostgreSQL (valfri i dev; krävs för persistens).
- Lagrar profil, League‑koppling och snapshots.

**Externa**
- Discord OAuth2 + REST v10.
- Riot/League APIs (om integrerat).

## Dataflöden (textdiagram)

### Inloggning (OAuth)
1. Web: användaren går till `/login` → link till `/api/auth/discord`.
2. API: redirect till Discord OAuth2 authorize.
3. Discord: callback till `/api/auth/discord/callback`.
4. API: sätter session‑cookie + krypterad token‑cookie, redirect till `{FRONTEND_URL}/dashboard`.
5. Web: anropar `GET /api/auth/me` för profil + accent.

### Profil (publik)
1. Web: `/u/:userId` → `GET /api/public/profile/:userId`.
2. API: läser profil + integrationer (db) och returnerar DTO.

### Discord REST proxy
1. Web: `/api/discord/...` (inloggad).
2. API: validerar session → proxar till Discord REST v10 med Bearer.

### Bot summary (serveröversikt)
1. Web: `GET /api/bot/guild/:id/summary`.
2. API: kräver bot‑token + allowlist → hämtar REST‑snapshot → returnerar sammanfattning.

### League integration
1. Web: connect/sync endpoints i API.
2. API: kallar Riot APIs → mappar till snapshot → sparar (db).

## Modulöversikt (nyckelfiler)

**Web**
- `apps/discord-hub-web/src/components/HubLayout.tsx` — shell + nav + tab‑strip.
- `apps/discord-hub-web/src/pages/` — route‑sidor.
- `apps/discord-hub-web/src/lib/` — shell‑logik, storage, helpers.
- `apps/discord-hub-web/src/config/` — actions, tools.
- `apps/discord-hub-web/src/i18n/` — UI‑copy.

**API**
- `apps/discord-hub-api/src/index.ts` — routes + handlers.
- `apps/discord-hub-api/src/discord-rest.ts` / `discord-proxy.ts` — Discord REST‑proxy.
- `apps/discord-hub-api/src/discord-tokens.ts` — OAuth token‑hantering.
- `apps/discord-hub-api/src/discord-gateway.ts` — optional voice‑gateway.
- `apps/discord-hub-api/src/riot-lol.ts` — League‑integration.
- `apps/discord-hub-api/src/profile-store.ts` / `repo.ts` — DB‑persistens.

## Fel- och fallbackbeteenden

- Utan `DATABASE_URL`:
  - `GET /api/me/hub-settings` returnerar `available: false`.
  - Publika profiler kan saknas (fallback till begränsad vy).
- Utan `DISCORD_BOT_TOKEN`:
  - Bot‑endpoints returnerar **503** (bot saknas).
- Caddy‑dev:
  - Sätt `VITE_HMR_CLIENT_PORT=80` om HMR blir grå.

## Säkerhet (kort)

- Discord‑proxys är allowlistade per prefix (användare + bot).
- Bot‑token lämnar aldrig servern.
- OAuth cookies är httpOnly och kan vara krypterade.
