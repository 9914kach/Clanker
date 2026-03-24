# Dokumentation och spårbarhet

Docs-viewern i **dev-tools-web** packar in **alla `*.md` i hela Clanker-repot** vid **byggtid** och vid dev-start via pluginen `plugins/clankerRepoMarkdown.ts` (virtuell modul `virtual:clanker-repo-md`). Den går igenom repots rot med Node `fs` — undantag: `node_modules`, `dist`, `.git`, `.cursor`.

Detta behövs eftersom Vites `import.meta.glob` bara inkluderar filer under appens `root` (`apps/dev-tools-web`), så markdown i **andra appar** under `apps/` kom inte med vid en repo-vid glob därifrån.

Det du ser är exakt det som fanns i trädet när `npm run build` kördes (eller när dev-servern startades).

## Sidomeny (grupper)

Dokument grupperas efter **var filen ligger**:

- **Repository** — markdown direkt i repots rot (t.ex. rot-`README.md`).
- **`docs (repo)`** — filer under `docs/` i roten (t.ex. `homelab-todo.md`).
- **`Pi-hole`** — filer under `pihole/`.
- **Övriga namn** — motsvarar mapp under `apps/` (t.ex. `discord-hub-web`, `discord-hub-api`, `dev-tools-web`), så varje app/bot/tjänst samlas under sin egen rubrik.

Nya `.md`-filer dyker upp efter omstart av dev-servern eller ny build.

## Visningsnamn

Sidomeny och (vid behov) sidhuvud styrs av `src/lib/docDisplay.ts`: kategorier och appar har **fasta läsbara rubriker**; dokument använder första `#`-raden i filen om den finns (så titeln matchar innehållet). Annars **humaniseras** sista sökvägsdelen (`checklists-and-tools` → «Checklists and tools») och `README` → «Översikt». Lägg till egna kartor i `CATEGORY_HEADINGS` / `APP_HEADINGS` när nya appar tillkommer.

## Byggstämpel

Sidfoten visar **paketversion** och **ISO-tidsstämpel** som sätts i `vite.config.ts`. För starkare spårbarhet i CI kan du lägga in t.ex. git-SHA via miljövariabler och `define` i samma config.

## Docker

Image-build behöver **hela repokontexten** (samma som `docker build` från rot med `.dockerignore`) så alla markdown-sökvägar finns när Vite bygger — se `apps/dev-tools-web/Dockerfile`.
