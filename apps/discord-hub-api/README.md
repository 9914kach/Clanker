# Discord hub — backend (`discord-hub-api`)

**Hono**-API för **discord-hub-web**: Discord OAuth2 (authorization code), httpOnly session-cookie (JWT), krypterad cookie för OAuth access/refresh, `GET /api/auth/me`, **allowlistade** proxys mot [Discord REST v10](https://discord.com/developers/docs/reference#api-versioning), **bot-baserad guild-summary**, och valfri **Gateway (WebSocket)** för live voice-state.

## Krav

- Node.js som stödjer `fetch` (Node 18+).

## Miljövariabler

Kopiera [`.env.example`](./.env.example) till **repo-roten** `.env` och/eller `apps/discord-hub-api/.env` och fyll i värden. Vid start laddas först repots `.env`, sedan `apps/discord-hub-api/.env` (den senare **överstyr** vid krock). Du kan också sätta variabler direkt i shell.

| Variabel | Beskrivning |
|----------|-------------|
| `DISCORD_CLIENT_ID` | Application ID från Discord Developer Portal. |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret. |
| `DISCORD_REDIRECT_URI` | Måste vara **identisk** med en redirect du lagt under OAuth2 → Redirects (t.ex. `http://localhost:5173/api/auth/discord/callback`). |
| `FRONTEND_URL` | Bas-URL till webben **utan** avslutande snedstreck (t.ex. `http://localhost:5173`). Efter lyckad inloggning redirectas användaren till `{FRONTEND_URL}/dashboard`. |
| `SESSION_SECRET` | Hemlig nyckel för JWT-signering (t.ex. `openssl rand -hex 32`). Används också för att härleda AES-nyckel till OAuth-cookien om `DISCORD_TOKEN_ENCRYPTION_KEY` saknas. |
| `DISCORD_OAUTH_SCOPES` | Valfritt. Blankstegsseparerade [OAuth2-scopes](https://docs.discord.com/developers/topics/oauth2#shared-resources-oauth2-scopes). Standard: `identify`. **Ändring kräver ny inloggning** för befintliga användare. |
| `DISCORD_OAUTH_PROMPT` | Valfritt: `consent` eller `none` (se Discord). |
| `DISCORD_PROXY_USER_PREFIXES` | Valfritt. Kommaseparerade URL-prefix (utan inledande `/`) som får anropas via användarproxyn. Standard: `users/@me,oauth2/@me`. |
| `DISCORD_BOT_TOKEN` | Valfritt. Bot-token från **Bot** i portalen. Aktiverar `/api/bot/discord/...`, `/api/bot/guild/:id/summary`, `/api/bot/live/*` och Gateway om guild-IDs är satta. **Committa aldrig.** |
| `DISCORD_PROXY_BOT_PREFIXES` | Valfritt. Allowlist för bot-REST-proxyn. Standard: `guilds/,channels/`. |
| `DISCORD_HUB_ALLOWED_GUILD_IDS` | Valfritt men **rekommenderas i prod**. Kommaseparerade snowflakes. Om satt får anroparen endast summary/live för dessa guilds. Tomt = ingen begränsning (endast för betrodd dev). |
| `DISCORD_HUB_ENFORCE_GUILD_MEMBERSHIP` | Valfritt. `1`/`true`: verifiera att inloggad användare (session `sub`) är medlem i guild via bot REST. |
| `DISCORD_GATEWAY_GUILD_IDS` | Valfritt. Kommaseparerade guild-IDs. Om satt tillsammans med bot-token startar en **Gateway-klient** som prenumererar på voice-state för dessa guilds. |
| `DISCORD_GATEWAY_INTENTS` | Valfritt. `minimal` (bara GUILDS), `voice` (GUILDS + GUILD_VOICE_STATES, standard), `presence` (inkl. GUILD_PRESENCES, **privileged**), eller decimalt bitmask. Se [Gateway intents](https://discord.com/developers/docs/topics/gateway#gateway-intents). |
| `DISCORD_TOKEN_ENCRYPTION_KEY` | Valfritt. Minst 32 UTF-8 byte; dedikerad nyckel för krypterad OAuth-cookie (`discord_oauth_tokens`). |
| `PORT` | Valfritt, standard `3001` (ska matcha Vite-proxyn i `discord-hub-web`). |

## Discord-applikation och bot (Fas 0 — drift)

1. [Discord Developer Portal](https://discord.com/developers/applications) → skapa **Application**.
2. **OAuth2** → **Redirects**: lägg hubbens callback-URL.
3. **Bot** → skapa bot, kopiera **token** till `DISCORD_BOT_TOKEN` (rotera om den läcker).
4. Bjud in boten: [Bot authorization](https://docs.discord.com/developers/topics/oauth2#bot-authorization-flow) — välj **minsta** permissions du behöver (undvik Administrator i onödan).
5. **Privileged Gateway Intents** (under Bot): slå endast på det ni behöver. **Presence** och **Message content** är privileged och kan kräva motivering hos Discord.
6. För live **voice** räcker oftast **GUILD_VOICE_STATES** (samt GUILDS) — motsvarar preset `voice` för `DISCORD_GATEWAY_INTENTS`.

OAuth-användare och bot-token är **olika** saker; hubben exponerar aldrig bot-token till webbläsaren.

### Säkerhet och loggning

- Logga **inte** råa Discord-svar som kan innehålla känsliga fält; logga aldrig `DISCORD_BOT_TOKEN` eller användares access tokens.
- Ogiltig bot-token ger **401** från Discord på REST; Gateway stänger med kod **4004** och försöker inte i oändlighet.

## Säkerhet: proxys

Öppen proxy mot hela `discord.com` skulle vara farlig (CSRF, missbruk). Därför:

- Endast sökvägar som börjar med dina **konfigurerade prefix** mot `https://discord.com/api/v10/...` tillåts i proxys.
- Sökvägar med `..`, omvänt snedstreck eller otillåtna tecken avvisas.
- Användarproxyn skickar användarens **Bearer-token**; bot-proxyn skickar **aldrig** bot-token till klienten.

Token-URL:er följer [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2): `POST` med `application/x-www-form-urlencoded` till `https://discord.com/api/oauth2/token`.

## Utveckling

Från repots rot (med variabler satta i miljön):

```bash
npm run dev:discord-api
```

Sedan starta `discord-hub-web` (`npm run dev`). Webbläsaren anropar `/api/...` via Vite-proxyn mot `127.0.0.1:3001`.

## Endpoints

| Metod | Sökväg | Beskrivning |
|-------|--------|-------------|
| GET | `/api/auth/discord` | Startar OAuth (redirect till `https://discord.com/oauth2/authorize`). |
| GET | `/api/auth/discord/callback` | Discord callback; sätter `discord_session` + krypterad `discord_oauth_tokens`; redirect till `{FRONTEND_URL}/dashboard`. |
| GET | `/api/auth/me` | Profilfält + `discord`-metadata från [`GET /oauth2/@me`](https://docs.discord.com/developers/topics/oauth2#get-current-authorization-information) när token finns. |
| POST | `/api/auth/logout` | Rensar session- och OAuth-token-cookies. |
| `*` | `/api/discord/*` | Inloggad användare: proxy till Discord REST v10 med Bearer; refresh enligt [refresh grant](https://docs.discord.com/developers/topics/oauth2#authorization-code-grant-refresh-token-exchange-example). |
| `*` | `/api/bot/discord/*` | Inloggad användare + `DISCORD_BOT_TOKEN`: proxy med `Authorization: Bot …`. **503** om bot-token saknas. |
| GET | `/api/bot/guild/:id/summary` | Inloggad + bot: sammansatt **REST-snapshot** (guild med `with_counts`, kanaler). **503** utan bot. **403** om allowlist/medlemskapsregler säger nej. **502/504** vid Discord-fel/timeout (en retry vid 429/503). |
| GET | `/api/bot/live/health` | Inloggad: Gateway-status (`connected`, heartbeat-ack, reconnect-försök, intents, `degraded`). |
| GET | `/api/bot/live/guild/:id` | Inloggad: Live **voice**-snapshot från Gateway-minne + anslutningsstatus. Tom lista om guild inte finns i `DISCORD_GATEWAY_GUILD_IDS` eller voice-intent saknas. |

### JSON-exempel: `GET /api/bot/guild/:id/summary`

```json
{
  "guild": {
    "id": "…",
    "name": "Min server",
    "icon": "hash eller null",
    "approximate_member_count": 42,
    "approximate_presence_count": 12
  },
  "channels": [
    { "id": "…", "type": 0, "name": "general", "parent_id": null }
  ],
  "channel_count": 15
}
```

Discord-svar via generisk bot-proxy returneras med samma statuskropp; relevanta `X-RateLimit-*` / `Retry-After` vidarebefordras.

## Gateway — fel och återanslutning

- Vid nätverksfel: exponentiell **backoff** (upp till ~60 s) och ny WebSocket.
- **INVALID_SESSION** (`d: false`): session nollställs, anslutning stängs och öppnas om; ny **IDENTIFY**.
- **INVALID_SESSION** (`d: true`): **RESUME** efter kort slumpfördröjning.
- **Gateway close 4004**: ogiltig bot-token — klienten **stoppas** (loggar orsak utan token).

## Produktion

```bash
npm run build -w discord-hub-api
npm run start -w discord-hub-api
```

Sätt `NODE_ENV=production` så cookies får flaggan `Secure`. Terminera TLS på reverse proxy (Caddy/nginx) och prox:a `/api` till denna tjänst.

PostgreSQL och övrig hub-logik kan byggas ut här senare (`DATABASE_URL` m.m.).
