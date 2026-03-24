# Docker & Compose i Clanker

Kort referens för **vanliga kommandon** och hur de används i detta repo. Alla exempel förutsätter att du står i **repots rot** (mappen där `docker-compose.yml` och `README.md` ligger), t.ex. `~/apps/Clanker`.

## Varför alltid roten?

Compose-filen använder volymsökvägar som `./etc-pihole` och `./etc-dnsmasq.d` samt `build.context: .` för webbapparna. Körs du från fel katalog hittar inte Docker filerna eller monorepot (`packages/ui` m.m.).

```bash
cd ~/apps/Clanker   # anpassa sökväg efter din maskin
```

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

**Utveckling utan Docker** (npm från repots rot — *inte* samma portar som tabellen ovan):

| App | Kommando | Dev-server (typiskt) |
|-----|----------|----------------------|
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
- **Begränsning:** `dev.clanker.*` förutsätter att **Vite kör på samma värd som Docker** (`npm run dev` / `npm run dev:tools` på Pi:en). Kör du Vite bara på en annan maskin utan motsvarande nätverksväg når inte Caddy på Pi den processen.

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
