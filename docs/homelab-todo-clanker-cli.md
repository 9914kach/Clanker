# Clanker CLI & QoL — detaljerad backlog

**Länkad från:** [homelab-todo.md](homelab-todo.md) (primär homelab-backlog).

Denna fil är en **fördjupad** checklista och arkitekturanteckning för kommandoradsverktyg kring Docker Compose, Vite och Pi-hole — särskilt anpassad om du är **ny på Linux** och vill undvika många nästan identiska skript.

## Konvention

- `- [ ]` = inte påbörjad  
- `- [x]` = klar (datum i parentes vid behov)  
- Underpunkter = delsteg eller beslut att dokumentera

---

## Syfte

- Ett **tydligt** sätt att starta/stoppa **en profil i taget** eller hela stacken utan att manuellt komma ihåg `docker compose --profile …`.
- **Samma rot och `.env`** varje gång (som `clanker-run` / `clanker-kill` redan gör).
- **Dokumentation** för PATH, symlinks och skillnaden `up` / `stop` / `down`.
- **Långsiktigt:** en tunn **dispatcher** (`scripts/clanker`) + delad logik (`source` av små `*.sh`-bibliotek), inte en enda megafil och inte dussinet kopior.

---

## Linux-grunder (kort)

- **PATH:** kataloger där skalet söker kommandon. `echo $PATH` visar listan. Lägger du ett skript i t.ex. `/usr/local/bin` (via symlink) kan du köra det med bara namnet.
- **Symlink:** en pekare till en riktig fil. `ln -sf /full/path/till/scripts/clanker /usr/local/bin/clanker` — uppdatera sökvägen om din clone ligger annorlunda.
- **`chmod +x`:** filen måste vara körbar för att köras som `./scripts/clanker` eller via PATH.
- **`cd` till repots rot:** Compose använder relativa volymsökvägar (`./etc-pihole` m.m.); alla Clanker-skript ska köra från rot eller byta dit själva.

---

## Arkitektur (målbild)

```text
Användare → scripts/clanker (dispatcher)
         → delade libs (ROOT, ev. vite)
         → docker compose … / exec clanker-run / exec clanker-kill
```

- **Undvik:** en jättefil utan struktur **eller** många identiska `clanker.*`-skript med samma `cd` och compose-rad kopierad.

---

## Fas 0 — Beslut

- [x] (2025-03) **En huvudingång** `clanker` med delkommandon; behåll `clanker.run` / `clanker.kill` som separata skript (kompatibilitet med befintlig doc).
- [x] (2026-03) **Syntax:** `clanker up …` / `stop` / `run` / `kill` är primärt för vardag; `clanker compose …` för rå Compose — dokumenterat i `clanker help` och [docker.md](docker.md).
- [x] (2026-03) **`up` och `--build`:** standard `--build`; `clanker up PROFILE --no-build` fungerar; explicit `--build` från användaren dubblas inte.

---

## Fas 1 — Gemensam bas

- [x] (2025-03) Dispatcher sätter **ROOT** och **`cd` till repots rot** innan `docker compose`.
- [x] (2025-03) **Återanvänd** befintlig [scripts/clanker-vite-lib.sh](../scripts/clanker-vite-lib.sh) via **`clanker run`** → `clanker-run` (ingen duplicering av Vite-logik i dispatchern).
- [x] (2026-03) [scripts/clanker-root.sh](../scripts/clanker-root.sh) (`clanker_init_repo_root`) — source från `clanker`, `clanker-run`, `clanker-kill`.

---

## Fas 2 — Delkommandon & profil ↔ tjänst

Compose-profiler i [docker-compose.yml](../docker-compose.yml):

| Profil     | Tjänst (container)   | Kommentar                          |
|-----------|----------------------|-------------------------------------|
| `discord` | `discord-hub-web`    | Statisk webb, port från `.env`     |
| `devtools`| `dev-tools-web`      | Statisk webb, port från `.env`     |
| `caddy`   | `clanker-caddy`      | Reverse proxy port 80 (standard)   |
| `db`      | `clanker-db`         | Postgres                           |

`clanker-pihole` har **ingen profil** — startas med `docker compose up -d` (eller via `COMPOSE_PROFILES` + profiler som inte påverkar Pi-hole).

### Checklista implementation

- [x] (2025-03) `clanker help`
- [x] (2025-03) `clanker run` / `clanker kill` → befintliga skript
- [x] (2025-03) `clanker up` utan profiler → `docker compose up -d --build` (respekterar `COMPOSE_PROFILES` i `.env`)
- [x] (2025-03) `clanker up PROFILE [PROFILE …]` → `--profile` per namn
- [x] (2025-03) `clanker stop PROFILE` → stoppar mappad tjänst (en profil åt gången)
- [x] (2025-03) `clanker compose …` → vidarebefordran till `docker compose` från rot
- [x] (2025-03) `clanker ps` → `docker compose ps`
- [x] (2026-03) `clanker down` — varning + `docker compose down`; skillnad mot `kill` i [docker.md](docker.md)
- [x] (2026-03) `clanker dev discord|devtools` (standard `up` + Vite; `--vite-only`, `--no-build`/`--build`) + tunna skript `clanker-dev-discord` / `clanker-dev-tools`

---

## Fas 3 — Dokumentation

- [x] (2025-03) [docs/docker.md](docker.md) — avsnitt om `scripts/clanker`
- [x] (2025-03) [README.md](../README.md) — kort pekare + symlink-exempel
- [ ] Video eller intern wiki — bara om du vill (utanför repo).

---

## Fas 4 — Valfritt (nice-to-have)

- [x] (2026-03) **Tab completion** (`bash` / zsh via `bashcompinit`) — [scripts/clanker-completion.bash](../scripts/clanker-completion.bash)
- [x] (2026-03) **`clanker doctor`** — `docker compose ps`, `.env`, `node_modules` om `CLANKER_VITE_DEV=1`
- [x] (2026-03) Enhetliga **svenska** felmeddelanden med **försök:** … i dispatchern

---

## Klart (arkiv)

- [x] (2025-03) Första version av `scripts/clanker` med `help`, `run`, `kill`, `up`, `stop`, `compose`, `ps`.
- [x] (2026-03) Utökning: `down`, `doctor`, `clanker-root.sh`, `--build`-dedupe, completion, doc-uppdateringar.
- [x] (2026-03) `clanker dev` (enskild Vite-app) + wrappers.
- [x] (2026-03) **`clanker up`** / **`clanker-run`**: alltid `--profile caddy` (inte `clanker compose`).

---

## Beslutade frågor (tidigare öppna)

- **Vite:** `clanker run` = samma som `clanker-run` (Compose + ev. **båda** Viter via `dev:all` i bakgrunden om `CLANKER_VITE_DEV=1`). `clanker dev discord` kör **`clanker up` för profilen** och sedan **`npm run dev:discord-stack`** (discord-hub-api + discord-hub-web). `clanker dev devtools` kör en Vite-app som förut. `--vite-only` hoppar över Docker; för discord startas då bara Vite — kör `npm run dev:discord-api` separat om OAuth ska fungera. `clanker up` startar inte Vite (dokumenterat i `help` och docker.md).
- **`CLANKER_KILL_KEEP_PIHOLE`:** kort rad i `clanker help` under `kill` + full förklaring i [docker.md](docker.md) (avsnitt om `clanker.kill`).
