# Docker & Compose i Clanker

Kort referens för **vanliga kommandon** och hur de används i detta repo. Alla exempel förutsätter att du står i **repots rot** (mappen där `docker-compose.yml` och `README.md` ligger), t.ex. `~/apps/Clanker`.

## Varför alltid roten?

Compose-filen använder volymsökvägar som `./etc-pihole` och `./etc-dnsmasq.d` samt `build.context: .` för webbapparna. Körs du från fel katalog hittar inte Docker filerna eller monorepot (`packages/ui` m.m.).

```bash
cd ~/apps/Clanker   # anpassa sökväg efter din maskin
```

## Ett kommando från SSH (`clanker.run`)

Skriptet [`scripts/clanker-run`](../scripts/clanker-run) byter alltid till **repots rot** och kör `docker compose up -d --build`. Vilka profiler som startas styrs av **`COMPOSE_PROFILES` i `.env`** — utan den variabeln startar du i praktiken främst tjänster utan profil (t.ex. Pi-hole). Sätt t.ex. `COMPOSE_PROFILES=discord,devtools` eller lägg till `,caddy` / `,db` enligt behov (se `.env.example`).

**Vite i bakgrunden (valfritt):** sätter du **`CLANKER_VITE_DEV=1`** i `.env` och har kört **`npm install`** i roten startar skriptet efter lyckad Compose-körning även **`npm run dev:all`** (discord-hub + dev-tools) i bakgrunden med `setsid`, så Caddy kan nå `dev.clanker.*` utan separat terminal. PID sparas i **`.clanker/vite-dev.pid`** (gitignorerad), logg i **`.clanker/vite-dev.log`**. Utan `npm` eller `node_modules/` skrivs en varning och Compose påverkas inte. Om en Vite-process redan körs enligt PID-filen startas ingen ny.

**Kör från repo:**

```bash
./scripts/clanker-run
```

**Flaggor** vidarebefordras till `docker compose up`, t.ex.:

```bash
./scripts/clanker-run --no-build
```

**Globalt kommando** (anpassa sökvägen till din clone):

```bash
sudo ln -sf "$HOME/apps/Clanker/scripts/clanker-run" /usr/local/bin/clanker.run
clanker.run
```

## Stäng ned (`clanker.kill`)

Skriptet [`scripts/clanker-kill`](../scripts/clanker-kill) stoppar först **Vite** om **`.clanker/vite-dev.pid`** finns (samma som `clanker-run` skapade med `CLANKER_VITE_DEV=1` — hela processgruppen avslutas), därefter som standard **`docker compose down`** från **repots rot** (samma `.env` / `COMPOSE_PROFILES` som vid start).

**Pi-hole och DNS:** `clanker-pihole` har ingen Compose-profil och ingår därför i samma projekt. **`docker compose down` stoppar alltså Pi-hole också.** Klienter som i routern/DHCP **bara** har Pis IP som DNS-server får då inga DNS-svar (internet “fungerar inte”) tills Pi-hole startar igen — t.ex. med `./scripts/clanker-run` eller `docker compose up -d`. Lägg gärna in **sekundär DNS** (t.ex. `1.1.1.1`) i routern så uppslag fungerar om Pi är nere; se [pihole/README_PIHOLE.md](../pihole/README_PIHOLE.md) (avsnitt om DHCP och sekundär DNS).

**Lämn Pi-hole igång:** sätt **`CLANKER_KILL_KEEP_PIHOLE=1`** i `.env`. Då kör skriptet `docker compose stop` på `discord-hub-web`, `dev-tools-web`, `clanker-caddy` och `clanker-db` i stället för `down`. Containrar blir kvar i *exited*-läge (till skillnad från `down`). **Extra argument** (t.ex. `--volumes`) **används inte** i det läget — använd full `down` utan variabeln om du behöver dem.

Efteråt skrivs **compose-status** och **TCP-portar** (`ss -tlnp`). **Tolkning:** **22** (SSH), **111** (rpcbind), **631** (CUPS), **5900** (VNC) m.m. är vanliga värdtjänster; **127.0.0.1** med `node` kan vara IDE (t.ex. Cursor), inte Clanker. Efter **full** `down` ska Clanker-relaterat ofta vara borta: 80, 4173, 4174, 5173, 5174, 8080, och Pi-hole kan använda **TCP 53** (DNS över TCP syns här; **UDP 53** syns inte i `ss -tlnp`). Med **`CLANKER_KILL_KEEP_PIHOLE=1`** är **53** och **8080** i stället **förväntade** så länge Pi-hole kör. Om **5173/5174** står kvar kan det vara Vite utanför `clanker-run` eller en process som sluppit processgruppen.

**Kör från repo:**

```bash
./scripts/clanker-kill
```

**Flaggor** vidarebefordras till `docker compose down` (när `CLANKER_KILL_KEEP_PIHOLE` inte är satt), t.ex. ta bort volymer:

```bash
./scripts/clanker-kill --volumes
```

**Globalt kommando:**

```bash
sudo ln -sf "$HOME/apps/Clanker/scripts/clanker-kill" /usr/local/bin/clanker.kill
clanker.kill
```

## Kommandot `clanker` (dispatcher)

[`scripts/clanker`](../scripts/clanker) är en **tunn ingång** från repots rot: samma idé som `clanker.run` / `clanker.kill`, men med **delkommandon** så du slipper komma ihåg långa `docker compose --profile …`-rader. Detaljerad backlog och framtida förbättringar: [homelab-todo-clanker-cli.md](homelab-todo-clanker-cli.md).

| Kommando | Betydelse |
|----------|-----------|
| `clanker run` | = `./scripts/clanker-run` (Compose enligt `.env` + ev. Vite) |
| `clanker kill` | = `./scripts/clanker-kill` |
| `clanker up` | `docker compose up -d --build` (använder `COMPOSE_PROFILES` om satt) |
| `clanker up devtools` | Startar en profil i taget (kan lista flera: `discord devtools caddy`) |
| `clanker up … --no-build` | Samma som ovan men utan `--build` |
| `clanker stop devtools` | Stoppar **en** profils container (mappning se `clanker help`) |
| `clanker compose …` | Rå `docker compose` från rot (för avancerade fall) |
| `clanker ps` | `docker compose ps` |

**Linux kort:** lägg en symlink i en katalog som finns i `PATH` (t.ex. `ln -sf "$HOME/apps/Clanker/scripts/clanker" /usr/local/bin/clanker`) så räcker det att skriva `clanker` var du än står. Filen måste vara körbar (`chmod +x`).

```bash
./scripts/clanker help
```

---

## Starta alla tjänster (Docker)

**Snabbstart (utan Postgres)** — Pi-hole + båda webbapparna (vanligast om du inte kör API/DB än):

```bash
cd ~/apps/Clanker
docker compose --profile discord --profile devtools up -d --build
```

**Med Postgres** (när du behöver databasen, t.ex. till kommande API):

```bash
docker compose --profile discord --profile devtools --profile db up -d --build
```

**Med Caddy** (HTTP på port 80 — prod-webb, Pi-hole-admin, samt `dev.clanker.*` mot Vite på värden om det körs):

```bash
docker compose --profile discord --profile devtools --profile caddy up -d --build
```

- `--build` bygger om webb-images efter kodändringar; utelämna den om du bara vill starta snabbt.
- Vill du **bara** Pi-hole: `docker compose up -d` (inga profiler).

**Miljö:** ha `.env` från `.env.example` om du behöver egna portar eller Pi-hole-inställningar.

**Valfritt — kortare kommando:** i `.env` kan du sätta `COMPOSE_PROFILES=discord,devtools` (lägg till `,db` för Postgres, `,caddy` för reverse proxy). Sedan:

```bash
docker compose up -d --build
```

(Pi-hole startar fortfarande; den har ingen profil.)

---

## Fuskblad: vad är vad (portar)

| Vad | Typ | Var du når det | Standard om inget annat står i `.env` |
|-----|-----|----------------|----------------------------------------|
| **Discord hub** (webb, nginx-build) | Docker | `http://<din-pi>:4173` | Värdport **4173** → nginx port 80 i containern (`DISCORD_HUB_WEB_PORT`) |
| **Dev tools** (webb, nginx-build) | Docker | `http://<din-pi>:4174` | Värdport **4174** (`DEV_TOOLS_WEB_PORT`) |
| **Caddy** (valfritt, reverse proxy) | Docker | `http://clanker.discord`, `http://clanker.tools`, `http://clanker.pihole`, `http://dev.clanker.discord`, … (standardnamn; se [Caddy](#caddy-reverse-proxy)) | Värdport **80** eller `CADDY_HTTP_PORT`; profil **`caddy`**. Proxar även Pi-hole-admin och Vite på värden via `host.docker.internal`. |
| **PostgreSQL** | Docker | Endast **på själva Pi:ns** loopback | **127.0.0.1:5432** på värden (ej öppet mot hela LAN som standard) (`POSTGRES_PORT`) |
| **Pi-hole** (DNS + admin m.m.) | Docker, `host`-nät | Direkt på värden: `WEB_PORT` / `FTLCONF_webserver_port` (t.ex. **8080** i `.env.example`). DNS: port **53**. Via Caddy: `http://clanker.pihole` på värdens port **80** (samma ingång som övriga Caddy-namn). | Pi-hole delar Pi:ns nätverksstack. |

Om klienterna i LAN **bara** använder Pis IP som DNS och Pi-hole-containern **inte** kör, försvinner namnuppslag (det kan kännas som att hela nätverket är nere även om t.ex. `ping 1.1.1.1` fungerar). Sätt gärna **sekundär DNS** i routern/DHCP eller läs mer under felsökning i [`pihole/README_PIHOLE.md`](../pihole/README_PIHOLE.md).

**Utveckling utan Docker** (npm från repots rot — *inte* samma portar som tabellen ovan):

| App | Kommando | Dev-server (typiskt) |
|-----|----------|----------------------|
| Båda (rekommenderat med Caddy `dev.clanker.*`) | `npm run dev:all` | Vite **5173** + **5174** parallellt |
| Discord hub | `npm run dev` | Vite, oftast **5173** |
| Dev tools | `npm run dev:tools` | Vite, oftast **5174** |

Alltså: **4173/4174** = färdigbyggd statisk sajt i container; **5173/5174** = lokal Vite med hot reload.

---

## Tjänster och profiler

I `docker-compose.yml` finns fem tjänster. **Profiler** styr vilka som startar när du kör `up` — undviker att t.ex. databas eller extra webbar startar av misstag.

| Tjänst | Container-namn | Profil | Standard / notis |
|--------|------------------|--------|------------------|
| `discord-hub-web` | `discord-hub-web` | `discord` | Port **4173→80** i containern (`DISCORD_HUB_WEB_PORT` i `.env`) |
| `dev-tools-web` | `dev-tools-web` | `devtools` | Port **4174→80** (`DEV_TOOLS_WEB_PORT`) |
| `clanker-caddy` | `clanker-caddy` | `caddy` | HTTP på värd: `CADDY_HTTP_PORT` (standard **80**). Prod, Pi-hole-admin, dev-Vite — se [Caddy](#caddy-reverse-proxy); `extra_hosts: host.docker.internal:host-gateway`. |
| `clanker-db` | `clanker-db` | `db` | Postgres 16, volym `clanker-pgdata`, port **127.0.0.1:5432** på värden |
| `clanker-pihole` | `clanker-pihole` | *(ingen)* | `network_mode: host` — delar Pi:ns nätverksstack |

- **Ingen profil** = tjänsten ingår i “default”-uppsättningen när du kör `docker compose up` utan `--profile`.
- **Med profil** = tjänsten startar bara om du anger motsvarande `--profile` (eller sätter miljövariabeln `COMPOSE_PROFILES`).

Pi-hole har ingen profil, så den startar ofta när du kör ett brett `up`. Webbapparna kräver explicit `discord` / `devtools`. **Caddy** kräver profilen `caddy`. Namnen `clanker.discord` / `clanker.tools` ger **502** om motsvarande webbcontainer inte kör; `clanker.pihole` funkar om Pi-hole lyssnar på värdens `WEB_PORT` och `CLANKER_PIHOLE_UPSTREAM` stämmer. `dev.clanker.*` ger **502** om Vite inte kör på **samma värd som Docker**.

## Miljövariabler (`.env`)

Kopiera `.env.example` → `.env` och justera. För Docker är bland annat detta relevant:

- `DISCORD_HUB_WEB_PORT`, `DEV_TOOLS_WEB_PORT` — vilken port på **värden** som mappas till nginx i containern.
- Caddy (profil `caddy`): `CADDY_HTTP_PORT`, prod- och dev-värdnamn/upstreams, `CLANKER_PIHOLE_HOST`, `CLANKER_PIHOLE_UPSTREAM` (ska matcha Pi-holes `WEB_PORT`) — se [Caddy](#caddy-reverse-proxy).
- Postgres: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` (när du använder profilen `db`).
- Pi-hole läser `env_file: .env` — se Pi-hole-dokumentation och repots egna guider under `pihole/`.

## Caddy (reverse proxy)

Valfri tjänst **`clanker-caddy`** (`caddy:2-alpine`) läser [infra/caddy/Caddyfile](../infra/caddy/Caddyfile) och routar HTTP utifrån **Host**-header. Containern har `extra_hosts: host.docker.internal:host-gateway` så proxyn kan nå **värdmaskinen** (Pi-holes webb-UI och Vite).

### Standardvärdnamn (överskrivs i `.env`)

| Värdnamn | Mål |
|----------|-----|
| `clanker.discord` | Prod discord-hub → `discord-hub-web:80` |
| `clanker.tools` | Prod dev-tools-web → `dev-tools-web:80` |
| `clanker.pihole` | Pi-hole admin → `CLANKER_PIHOLE_UPSTREAM` (standard `http://host.docker.internal:8080`) |
| `dev.clanker.discord` | Vite discord-hub på värden (port **5173**) |
| `dev.clanker.tools` | Vite dev-tools-web på värden (port **5174**) |

Om du ändrar Pi-holes **`WEB_PORT`** / **`FTLCONF_webserver_port`** i `.env`, sätt **`CLANKER_PIHOLE_UPSTREAM`** till samma port (t.ex. `http://host.docker.internal:9090`).

### DNS eller hosts

Alla namn du använder måste peka på **den adress där Caddy lyssnar** (Pi:ns IP i LAN, eller `127.0.0.1` om du SSH-/port-forwardar värdens port 80 till din laptop).

Exempel (en rad):

```text
127.0.0.1  clanker.discord  clanker.tools  clanker.pihole  dev.clanker.discord  dev.clanker.tools
```

### Start

`docker compose --profile discord --profile devtools --profile caddy up -d --build`, eller lägg `caddy` i `COMPOSE_PROFILES`. Du kan även starta bara `clanker-caddy` om du bara vill proxyn (t.ex. `clanker.pihole`) — prod-namn ger då **502** tills webbcontainrarna körs.

### Övrigt

- **4173 och 4174** — oförändrat direkt till nginx i containrarna.
- **Endast HTTP:** [Caddyfile](../infra/caddy/Caddyfile) använder `http://` så Caddy inte aktiverar HTTPS mot **443** (inte mappad i Compose). HTTPS kan läggas framför eller i Caddy senare.
- **Begränsning:** `dev.clanker.*` förutsätter att **Vite kör på samma värd som Docker** (`npm run dev:all` eller båda `npm run dev` och `npm run dev:tools` på Pi:en). Kör du Vite bara på en annan maskin utan motsvarande nätverksväg når inte Caddy på Pi den processen.
- **Grå sida på `dev.clanker.*`:** du laddar HTML på port **80**, men Vite försöker annars koppla HMR-WebSocket mot **5173/5174** (som inte går via Caddy). Lägg **`VITE_HMR_CLIENT_PORT=80`** i **repots rot-**`.env` och **starta om** Vite. (`vite.config` använder `loadEnv` mot roten så värdet plockas upp — `process.env` i config-filen läser inte `.env` automatiskt.) Lämna variabeln borttagen om du bara använder `http://localhost:5173` / `:5174`.

## Kolla status

Här ser du om Clanker-tjänsterna (eller andra containrar) **kör**, vilka **portar** som exponeras, och om **Docker** svarar.

### Bara detta repo (Compose-projektet)

Stå i **repots rot** så Compose känner igen `docker-compose.yml` och rätt projektnamn.

```bash
cd ~/apps/Clanker
docker compose ps
```

- **Kolumnen `STATE` / `STATUS`** visar om containern kör (t.ex. `running`) eller är stoppad (`exited`).
- **Portar** visas som `0.0.0.0:4173->80/tcp` (värdport → containerport) för webbapparna.

Visa även **stoppade** containrar som tillhör projektet:

```bash
docker compose ps -a
```

### Allt som kör på maskinen (`docker ps`)

Oberoende av katalog — listar **alla** containrar Docker känner till:

```bash
docker ps              # bara körande
docker ps -a           # körande + stoppade
```

Filtrera på namn (matchar delsträng i namnet):

```bash
docker ps -a --filter "name=discord-hub-web"
docker ps -a --filter "name=clanker"
```

Containrar i detta repo har ofta namnen `discord-hub-web`, `dev-tools-web`, `clanker-db`, `clanker-pihole` (samma som i Compose).

### Lever Docker-daemonen?

```bash
docker info
```

Om kommandot svarar med info (version, images, …) kör daemonen. Vid fel: t.ex. `sudo systemctl status docker` på Raspberry Pi / Linux med systemd.

### CPU/minne i realtid

```bash
docker stats
```

Visar resursanvändning per **körande** container; avsluta med `Ctrl+C`.

### Processer inuti projektets containrar

```bash
cd ~/apps/Clanker
docker compose top
```

## Grundläggande Compose-kommandon

### `docker compose up`

Skapar och startar containrar enligt `docker-compose.yml`.

| Flagga / form | Betydelse |
|---------------|-----------|
| `-d` | *Detached* — körs i bakgrunden (daemon). |
| `--build` | Bygger om images innan start (bra efter kodändringar i Dockerfile). |
| `--profile <namn>` | Aktiverar en profil; kan upprepas för flera. |

**Exempel — bara discord-hub:**

```bash
docker compose --profile discord up -d --build
```

**Exempel — båda webbapparna:**

```bash
docker compose --profile discord --profile devtools up -d --build
```

**Exempel — båda webbapparna + Caddy** (port 80: prod, Pi-hole-admin, `dev.clanker.*` — se [Caddy](#caddy-reverse-proxy)):

```bash
docker compose --profile discord --profile devtools --profile caddy up -d --build
```

**Exempel — webb + Postgres (t.ex. när API:t ska använda DB):**

```bash
docker compose --profile discord --profile devtools --profile db up -d --build
```

**Exempel — bara Pi-hole (om inget annat ska med):**

```bash
docker compose up -d clanker-pihole
```

*(Om du redan har andra tjänster igång påverkas de inte om du bara anger en tjänst — Compose startar/uppdaterar det du ber om.)*

### `docker compose down`

Stoppar och **tar bort** containrar som skapats av detta projekt. **Volymen** `clanker-pgdata` tas inte bort i standardfallet (databasdata finns kvar).

```bash
docker compose down
```

Vill du även ta bort volymer kopplade till projektet (⚠️ kan radera databasdata):

```bash
docker compose down -v
```

Använd `-v` bara när du medvetet vill nollställa.

### `docker compose ps`

Samma som i avsnittet [Kolla status](#kolla-status) ovan — kör från repots rot.

```bash
docker compose ps
docker compose ps -a
```

### `docker compose logs`

Följer eller visar loggar.

```bash
docker compose logs -f                    # alla tjänster, följer
docker compose logs -f discord-hub-web     # en tjänst
docker compose logs --tail=100 dev-tools-web
docker compose logs -f clanker-caddy       # reverse proxy (när profilen caddy är aktiv)
```

### `docker compose pull`

Hämtar nyare **images** där `image: ...` används (t.ex. `postgres:16-alpine`, `pihole/pihole`). Påverkar inte lokalt **byggda** webbimages (`build:`).

```bash
docker compose pull
docker compose pull clanker-db clanker-pihole
```

### `docker compose build`

Bygger images utan att starta containrar.

```bash
docker compose build
docker compose build discord-hub-web dev-tools-web
```

### `docker compose restart`

Startar om redan skapade containrar (snabbt om du bara vill ladda om processen).

```bash
docker compose restart discord-hub-web
```

### `docker compose stop` / `start`

`stop` stoppar utan att ta bort containrar; `start` startar dem igen.

```bash
docker compose stop dev-tools-web
docker compose start dev-tools-web
```

## Bygga en webb-image manuellt (utan Compose)

Ibland vill du bara verifiera att en Dockerfile bygger:

```bash
docker build -f apps/discord-hub-web/Dockerfile . -t clanker-discord-hub:local
docker build -f apps/dev-tools-web/Dockerfile . -t clanker-dev-tools:local
```

Context är alltid **`.`** (roten) så monorepot och `package-lock.json` följer med.

## `docker compose` vs `docker-compose`

- **Rekommenderat:** `docker compose` (plugin till Docker CLI, V2).
- Äldre fristående binären: `docker-compose` (med bindestreck). Samma idé, annat kommando.

Om `docker compose` saknas: installera Docker Compose-plugin enligt din distros/Docker-dokumentation.

## Felsökning

### `failed to resolve registry-1.docker.io` / `127.0.0.1:53: connection refused`

Gäller **både** `docker pull`, **`docker compose up --build`** och när BuildKit hämtar basimages (`node:…`, `nginx:…`, `postgres:…`). Ofta pekar värdens DNS mot **127.0.0.1:53** (Pi-hole). Om inget svarar där faller uppslagningen av `registry-1.docker.io`.

**Varför hjälper ibland inte `daemon.json` → `"dns"`?**  
Den inställningen styr främst **DNS för körande containrar**. Vid **`docker build`** (BuildKit) används ofta **värdens** resolver (`/etc/resolv.conf`) för att nå Docker Hub — då spelar det ingen roll att du satte `1.1.1.1` i `daemon.json`; felet kan vara kvar på `127.0.0.1:53`.

Kolla vad värdens använder:

```bash
cat /etc/resolv.conf
```

**Åtgärder (välj det som passar din Pi):**

1. **Starta Pi-hole först** så att `127.0.0.1:53` faktiskt svarar, sedan `docker compose … up -d --build` igen.
2. **Byt tillfälligt värd-DNS** bort från en död `127.0.0.1` — exakt metod beror på om du kör **dhcpcd**, **NetworkManager** eller **systemd-resolved** (Bookworm kan använda `127.0.0.53` mot resolved). Målet är att `resolv.conf` pekar på t.ex. `1.1.1.1` eller routern **medan** du bygger images.
3. **`daemon.json` + `"dns"`** kan ändå hjälpa för **körda** containrar; behåll gärna inställningen om du slog ihop med befintlig JSON. Starta om Docker efter ändring: `sudo systemctl restart docker`.
4. **Diagnostik:** prova äldre byggmotor (använder ibland annan DNS-väg):  
   `DOCKER_BUILDKIT=0 docker compose --profile discord --profile devtools build`  
   (sedan `up -d` utan `--build` om images redan finns.)
5. **Postgres:** utelämna `--profile db` tills DNS är löst om du bara behöver webb/Pi-hole.

## Vanliga frågor

**Hur startar jag allt, och var finns det dokumenterat?**  
Använd avsnittet [Starta alla tjänster (Docker)](#starta-alla-tjänster-docker) (snabbstart **utan** Postgres först) och [Fuskblad](#fuskblad-vad-är-vad-portar) i denna fil (`docs/docker.md`).

**Varför startar inte discord när jag kör `docker compose up -d`?**  
Troligen saknas profilen `discord`. Kör med `--profile discord` (eller sätt `COMPOSE_PROFILES=discord` i `.env` / shell).

**Kan jag köra båda webbapparna samtidigt?**  
Ja: `docker compose --profile discord --profile devtools up -d`. De lyssnar på olika värdportar (standard 4173 och 4174).

**Var hamnar databasfilerna?**  
I Docker-volymen `clanker-pgdata` (namn brukar prefixas med projektnamn — kolla med `docker volume ls`).

**Pi-hole och portar**  
Med `network_mode: host` exponeras Pi-hole enligt Pi-holes egen konfiguration på värden — inte via `ports:` i Compose på samma sätt som webbcontainrarna.

## Se även

- Rot-`README.md` — översikt och checklista för ny installation.
- `apps/discord-hub-web/README.md`, `apps/dev-tools-web/README.md` — apptspecifika portar och utveckling.
- `pihole/` — guider kring Pi-hole i detta repo.
