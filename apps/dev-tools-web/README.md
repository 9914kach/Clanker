# Dev tools (`dev-tools-web`)

Lokal **samling av utvecklingsverktyg** (separat från discord-hubben): dokumentationsviewer för **alla `*.md` i repot** (grupperat per app/område), homelab-TODO (`docs/homelab-todo.md`), checklistor, externa länkar och enkel HTTP-test. Gemensam **topbar-meny** styrs av en nav-konfiguration så nya verktyg är lätta att lägga till.

**UI:** Tailwind CSS v4 (Vite-plugin), shadcn/ui-komponenter i delat paket **`@clanker/ui`** (`packages/ui/`), och **Framer Motion** för enkel rörelse. Nya shadcn-delar kan läggas med `npx shadcn@latest add …` från denna mapp (se `components.json`).

## Starta applikationen

Du kan köra appen på två sätt: **Vite dev-server** (snabb feedback, hot reload) eller **Docker** (samma upplägg som på Pi, statisk build i nginx).

### A. Utveckling med npm (rekommenderat när du ändrar kod)

Alla kommandon körs från **repots rot** (`Clanker/`, där rot-`package.json` ligger).

```bash
cd ~/apps/Clanker   # eller sökvägen dit du klonat repot
npm install
npm run dev:tools
```

Öppna **http://localhost:5174** (standardport; Vite kan välja annan port om 5174 är upptagen — se terminalutskrift).

**Raspberry Pi / Linux utan Node:** Om du får `npm: command not found` har du inget Node.js installerat. Antingen:

- **Installera Node** (t.ex. [nvm](https://github.com/nvm-sh/nvm) och Node 22, i linje med Docker-imagen):

  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  # ny terminal eller: source ~/.bashrc
  nvm install 22
  nvm use 22
  ```

  Sedan `npm install` och `npm run dev:tools` som ovan.

- **Eller** använd bara Docker (nedan) — då behövs inte npm på värden, men du måste bygga om containern när koden ändras.

**Felsökning — `EACCES` / permission denied** vid `npm install` eller när Vite startar (t.ex. under `node_modules/@esbuild/` eller `.vite-temp/`): repot eller `node_modules` ägs ofta av **root** efter `sudo npm install` eller liknande. Lägg tillbaka ägarskap till din användare och installera om:

```bash
cd ~/apps/Clanker
sudo chown -R "$(whoami):$(whoami)" .
rm -rf node_modules apps/*/node_modules
npm install
```

### B. Docker (produktionstilliknande på Pi eller lokalt)

Från repots rot:

```bash
cd ~/apps/Clanker
docker compose --profile devtools up -d --build dev-tools-web
```

Öppna **http://\<värd\>:4174** (eller det du satt som `DEV_TOOLS_WEB_PORT` i `.env`).

**Valfritt:** med Compose-profilen **`caddy`** når du samma build via valt värdnamn (standardfiler i [infra/caddy/Caddyfile](../../infra/caddy/Caddyfile)) — se [docs/docker.md](../../docs/docker.md#caddy-reverse-proxy).

Efter **kodändringar** måste imagen byggas om så att ny `dist` hamnar i containern:

```bash
docker compose --profile devtools up -d --build dev-tools-web
```

Profilen `devtools` måste anges — tjänsten startar inte med ett vanligt `docker compose up -d` utan profil.

## Utveckling (kort)

- Dev-server: `npm run dev:tools` (port **5174**, `discord-hub-web` kan använda **5173** parallellt).
- Bygga statiskt lokalt: `npm run build:tools` (output i `apps/dev-tools-web/dist/`).

## Struktur

| Sökväg | Roll |
|--------|------|
| Alla `**/*.md` i repot | Docs-viewern (undantag: `node_modules`, `dist`, `.git`) |
| `src/config/toolsNav.ts` | Menyposter (id, label, path) för topbaren |
| `src/layout/AppShell.tsx` | Gemensamt skal med `Outlet` |
| `src/components/TopNav.tsx` | Topbar länkar från `toolsNav` |
| `src/data/checklists/` | Checklistor som JSON + `index.ts` som samlar dem |
| `src/data/externalLinks.json` | Grupperade externa länkar (Grafana m.m.) |
| `src/tools/*.tsx` | Verktygssidor (checklists, länkar, HTTP, homelab-TODO) |
| `vite.config.ts` | `server.fs.allow` mot repots rot så `docs/homelab-todo.md` kan importeras från `HomelabTodoPage` |
| `Dockerfile` | Kopierar hela repot (enligt `.dockerignore`) vid build så alla `*.md` och TODO-importen finns |

### Lägga till ett nytt verktyg

1. Lägg till post i `src/config/toolsNav.ts`.
2. Lägg till `<Route>` i `src/App.tsx` (under parenten med `AppShell`).
3. Skapa sidkomponent under `src/tools/` (eller valfri mapp) och importera den.

Mer detalj finns i `docs/development/checklists-and-tools.md`.

Discord-hubben: `apps/discord-hub-web/`.
