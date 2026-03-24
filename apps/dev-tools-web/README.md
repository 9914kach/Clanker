# Dev tools (`dev-tools-web`)

Lokal **samling av utvecklingsverktyg** (separat från discord-hubben): dokumentationsviewer, plats för framtida små utilities och checklistor.

## Utveckling

Från repots rot:

```bash
npm install
npm run dev:tools
```

Standard dev-port **5174** (så `discord-hub-web` kan köra på 5173 samtidigt). Vite kan byta port om 5174 är upptagen.

## Docker på Pi

```bash
cd ~/apps/Clanker
docker compose --profile devtools up -d --build dev-tools-web
```

Standardport **4174** (eller `DEV_TOOLS_WEB_PORT` i `.env`).

## Struktur

| Sökväg | Roll |
|--------|------|
| `docs/**/*.md` | Markdown som docs-viewern läser in vid build |
| `src/tools/` | (Förslag) nya verktyg/moduler med egna routes |

Discord-hubben: `apps/discord-hub-web/`.
