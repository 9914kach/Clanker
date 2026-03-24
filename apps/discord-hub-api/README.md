# Discord hub — backend (`discord-hub-api`)

Minimal **Hono**-API för **discord-hub-web**: Discord OAuth2 (authorization code), httpOnly session-cookie (JWT), `GET /api/auth/me`.

## Krav

- Node.js som stödjer `fetch` (Node 18+).

## Miljövariabler

Kopiera [`.env.example`](./.env.example) till **repo-roten** `.env` och/eller `apps/discord-hub-api/.env` och fyll i värden. Vid start laddas först repots `.env`, sedan `apps/discord-hub-api/.env` (den senare **överstyr** vid krock). Du kan också sätta variabler direkt i shell.

| Variabel | Beskrivning |
|----------|-------------|
| `DISCORD_CLIENT_ID` | Application ID från Discord Developer Portal. |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret. |
| `DISCORD_REDIRECT_URI` | Måste vara **identisk** med en redirect du lagt under OAuth2 → Redirects (t.ex. `http://localhost:5173/api/auth/discord/callback`). |
| `FRONTEND_URL` | Bas-URL till webben **utan** avslutande snedstreck (t.ex. `http://localhost:5173`). Efter lyckad inloggning redirectas användaren hit. |
| `SESSION_SECRET` | Hemlig nyckel för JWT-signering (t.ex. `openssl rand -hex 32`). |
| `PORT` | Valfritt, standard `3001` (ska matcha Vite-proxyn i `discord-hub-web`). |

## Discord-applikation

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **OAuth2** → **Redirects**: lägg till din callback-URL, t.ex. `http://localhost:5173/api/auth/discord/callback`.
3. Kopiera **Client ID** och **Client Secret** till miljövariablerna.
4. Scope `identify` används (ingen särskild “Privileged Gateway Intent” behövs för OAuth).

Om du utvecklar via Caddy (`http://dev.clanker.discord`) ska `DISCORD_REDIRECT_URI` och `FRONTEND_URL` använda **samma host** som webbläsaren (lägg till motsvarande redirect i portalen).

## Utveckling

Från repots rot (med variabler satta i miljön):

```bash
npm run dev:discord-api
```

Sedan starta `discord-hub-web` (`npm run dev`). Webbläsaren anropar `/api/...` via Vite-proxyn mot `127.0.0.1:3001`.

## Endpoints

| Metod | Sökväg | Beskrivning |
|-------|--------|-------------|
| GET | `/api/auth/discord` | Startar OAuth (redirect till Discord). |
| GET | `/api/auth/discord/callback` | Discord callback; sätter session-cookie; redirect till `FRONTEND_URL`. |
| GET | `/api/auth/me` | JSON `{ id, username, avatar }` eller 401. |
| POST | `/api/auth/logout` | Rensar session-cookie. |

## Produktion

```bash
npm run build -w discord-hub-api
npm run start -w discord-hub-api
```

Sätt `NODE_ENV=production` så session-cookies får flaggan `Secure`. Terminera TLS på reverse proxy (Caddy/nginx) och prox:a `/api` till denna tjänst.

PostgreSQL och övrig hub-logik kan byggas ut här senare (`DATABASE_URL` m.m.).
