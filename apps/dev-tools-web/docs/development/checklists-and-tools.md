# Checklistor och verktygsmeny

## Verktygsmeny

Menyposter definieras i `src/config/toolsNav.ts`. För att lägga till ett nytt verktyg:

1. Lägg till en post i `toolsNav` (id, label, path, `end: true` om path inte ska prefix-matchas).
2. Registrera en `<Route>` under shell i `src/App.tsx`.
3. Skapa sidkomponenten under `src/tools/` (eller annan mapp) och importera den i `App.tsx`.

## Checklistor

- Varje checklista är en **JSON-fil** under `src/data/checklists/` med fälten `id`, `title` och `items` (varje item har `id` och `label`).
- Importera filen och lägg den i arrayen i `src/data/checklists/index.ts`.
- I webbläsaren sparas avbockning per checklista-id i `localStorage` (nyckelprefix `dev-tools-checklist-v1:`).

## Externa länkar

Redigera `src/data/externalLinks.json`. Lägg aldrig lösenord eller tokens i filen.

## API-test (HTTP)

Sidan `src/tools/HttpPlaygroundPage.tsx` använder webbläsarens `fetch`. Anrop till andra domäner kräver **CORS** från servern; annars fungerar t.ex. same-origin-API:er eller en framtida proxy bättre.
