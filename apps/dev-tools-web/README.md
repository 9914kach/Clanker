# Dev tools (`dev-tools-web`)

Lokal **samling av utvecklingsverktyg** (separat från discord-hubben): dokumentationsviewer, checklistor, externa länkar och enkel HTTP-test. Gemensam **topbar-meny** styrs av en nav-konfiguration så nya verktyg är lätta att lägga till.

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
| `src/config/toolsNav.ts` | Menyposter (id, label, path) för topbaren |
| `src/layout/AppShell.tsx` | Gemensamt skal med `Outlet` |
| `src/components/TopNav.tsx` | Topbar länkar från `toolsNav` |
| `src/data/checklists/` | Checklistor som JSON + `index.ts` som samlar dem |
| `src/data/externalLinks.json` | Grupperade externa länkar (Grafana m.m.) |
| `src/tools/*.tsx` | Verktygssidor (checklists, länkar, HTTP) |

### Lägga till ett nytt verktyg

1. Lägg till post i `src/config/toolsNav.ts`.
2. Lägg till `<Route>` i `src/App.tsx` (under parenten med `AppShell`).
3. Skapa sidkomponent under `src/tools/` (eller valfri mapp) och importera den.

Mer detalj finns i `docs/development/checklists-and-tools.md`.

Discord-hubben: `apps/discord-hub-web/`.
