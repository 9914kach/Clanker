# Dokumentation och spårbarhet

Den här appen (**dev-tools-web**) packar in alla `*.md` under `docs/` vid **byggtid** (Vite `import.meta.glob`). Det du ser i viewer:n är exakt det som fanns i trädet när `npm run build` kördes (eller när dev-servern startades).

## Kategorier

Använd mapparna under `docs/` som namnrymd: `architecture/`, `development/`, `deployment/`, `adr/` (korta beslut). Nya `.md`-filer dyker upp i sidomenyn efter omstart av dev-servern.

## Byggstämpel

Sidfoten visar **paketversion** och **ISO-tidsstämpel** som sätts i `vite.config.ts`. För starkare spårbarhet i CI kan du lägga in t.ex. git-SHA via miljövariabler och `define` i samma config.
