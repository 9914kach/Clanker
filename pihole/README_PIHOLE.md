# Pi-hole på Raspberry Pi (Docker) - snabb guide

Denna guide beskriver hur din nuvarande setup fungerar och hur du snabbt kommer igång, underhåller och felsöker.

## 1) Översikt: hur allt fungerar

- Raspberry Pi kör Docker.
- En container (`clanker-pihole`) kör både DNS-tjänsten och Pi-hole webb-UI.
- Containern använder `network_mode: host`, vilket betyder att den delar nätverk med hosten.
- Klienter i nätet använder din Pis LAN-IP som DNS-server (byt ut exemplet mot din egen).
- Pi-hole filtrerar DNS-frågor mot blocklistor (du använder HaGeZi Pro).
- Frågor som inte blockeras skickas vidare till upstream DNS (Cloudflare + DNSSEC).

Kort flöde:

`Klient -> Pi-hole (din LAN-IP) -> blockera/tillåt -> Cloudflare -> svar tillbaka`

## 2) Din nuvarande konfig

### `docker-compose.yml` (endast i repots rot)

Filen heter `docker-compose.yml` och ligger i **repots rot** (`Clanker/docker-compose.yml`), inte under `pihole/`. Volymerna `./etc-pihole` och `./etc-dnsmasq.d` är relativa **rotmappen** — kör alltid `docker compose` därifrån (se rot-`README.md`).

- Image: `pihole/pihole:latest`
- Compose-tjänst och containernamn: `clanker-pihole`
- Nätverk: `host`
- Auto-restart: `unless-stopped`
- Volymer:
  - `./etc-pihole -> /etc/pihole`
  - `./etc-dnsmasq.d -> /etc/dnsmasq.d`
- Capability: `NET_ADMIN`
- Miljövariabler laddas från `.env`

### `.env` (repots rot)

Mall: `.env.example` i repots rot. Kopiera till `.env` bredvid `docker-compose.yml`.

- `TZ=Europe/Stockholm`
- `DNSMASQ_LISTENING=all`
- `WEB_PORT=8080`
- `FTLCONF_webserver_port=8080`
- `FTLCONF_dns_interface=eth0`

Det innebär att webbgränssnittet ligger på:

- `http://<din-pi-ip>:8080/admin`
- Exempel (påhittad adress): `http://192.168.1.50:8080/admin`

## 3) Kom igång (from scratch)

Kör på Raspberryn i repo-roten `~/apps/Clanker` (där `docker-compose.yml` ligger):

```bash
cd ~/apps/Clanker
docker compose pull
docker compose up -d
docker compose ps
```

Verifiera att containern är igång:

```bash
docker inspect -f '{{.State.Status}}' clanker-pihole
```

Förväntat: `running`.

## 4) Daglig drift

### Starta/stoppa

```bash
docker compose up -d
docker compose stop
docker compose restart
```

### Loggar

```bash
docker compose logs -f clanker-pihole
docker compose logs --since=24h clanker-pihole
```

### Uppdatera

```bash
docker compose pull
docker compose up -d
```

## 5) Hälsokontroll (snabb)

Du har ett script:

- `./pihole-healthcheck.sh`

Kör:

```bash
cd ~/apps/Clanker
./pihole/pihole-healthcheck.sh
```

Det kontrollerar:

- att vanliga domäner resolve:ar korrekt
- att blockerad domän faktiskt blockeras
- att containern `clanker-pihole` kör

## 6) Pi-hole UI: rekommenderade inställningar

- Blocklista: HaGeZi Pro
- Upstream DNS IPv4: Cloudflare (`1.1.1.1` + `1.0.0.1`)
- DNSSEC: aktiverat
- Interface setting: `Allow only local requests`

## 6b) DHCP via Pi-hole och sekundär DNS till klienter

När **Pi-hole** (inte routern) delar ut DHCP kan du ge klienterna **två DNS-servrar** via dnsmasq: först Pis LAN-IP (Pi-hole), sedan t.ex. `1.1.1.1` som fallback om Pi inte svarar på port 53.

- **Aktiv fil** (gitignored, bara på din maskin): `etc-dnsmasq.d/99-dhcp-dns-fallback.conf` — monteras som `/etc/dnsmasq.d/` i containern (se `docker-compose.yml`).
- **Mall i repot** (för nya kloner eller annan IP): `pihole/examples/99-dhcp-dns-fallback.conf.example` — kopiera till `etc-dnsmasq.d/99-dhcp-dns-fallback.conf` och justera första IP.
- Kräver att **DHCP i routern är av** på samma nät (annars dubbla DHCP-servrar).
- Efter ändring: från repo-rot kör `docker compose restart clanker-pihole`.

Om du använder **routerns DHCP** i stället ska sekundär DNS sättas där — inte bara via denna fil.

## 7) Felsökning

### Problem: "Internet slutar fungera" när containrar / Pi-hole stannar

Det här är nästan alltid **DNS**, inte att hela LAN:et eller routern går sönder.

- Pi-hole-containern (`clanker-pihole`) använder `network_mode: host` och tar **UDP/TCP port 53** på **Pis LAN-IP**.
- Om routern eller DHCP bara delar ut **Pis IP som (enda) DNS-server** till klienterna, finns det **ingen DNS** när containern är stoppad, kraschar eller när du kör `docker compose down` — då kan inget domännamn slås upp och webbläsare visar ofta "ingen anslutning".
- Compose har redan `restart: unless-stopped`; vid reboot bör containern komma upp igen om **Docker startar med systemet** (`sudo systemctl enable --now docker`).

**Gör så här om du vill att nätet ska vara användbart även när Pi-hole är nere**

- **Pi-hole delar ut DHCP:** använd `etc-dnsmasq.d/99-dhcp-dns-fallback.conf` (se [6b](#6b-dhcp-via-pi-hole-och-sekundär-dns-till-klienter)).
- **Routern delar ut DHCP:** sätt **sekundär DNS** i routern (t.ex. `1.1.1.1` eller `8.8.8.8`) bredvid Pis IP. Nackdel: vissa enheter kan ibland använda sekundären även när Pi lever, så en del frågor kan slippa Pi-hole-filtrering — det är avvägningen mot tillgänglighet.
- Alternativ (mer jobb): låt **routern** vara DNS mot klienterna och konfigurera den att vidarebefordra till Pi när du vill ha filter, med egen fallback i routern.

**Snabb kontroll på en klient**

- Om `ping 1.1.1.1` fungerar men `nslookup google.com` inte gör det → **DNS till Pis adress** (eller DHCP) är problemet, inte "internetledningen".

### Problem: klienter använder inte Pi-hole

Kontrollera att klienten verkligen har din Pis IP som DNS (ersätt `192.168.1.50` nedan).

På klient:

```bash
nslookup google.com 192.168.1.50
nslookup flurry.com 192.168.1.50
```

`flurry.com` ska blockeras (t.ex. `0.0.0.0` eller `NXDOMAIN`).

### Problem: UI nås inte

- Kontrollera att containern kör (`docker compose ps`)
- Kontrollera port (`8080`) och URL (`/admin`)
- Kontrollera lokal brandvägg/routerregler

### Problem: saker slutar fungera

- Gå till Query Log i Pi-hole
- Hitta blockerad domän
- Whitelista bara exakt domän som krävs (inte hela toppdomänen)

## 8) Struktur i projektet

- `docker-compose.yml` (repo-rot) - containerdefinition; kör alltid `docker compose` därifrån
- `.env` (repo-rot) - miljöinställningar
- `etc-pihole/` (repo-rot) - persistent Pi-hole-data
- `etc-dnsmasq.d/` (repo-rot) - extra dnsmasq-konfig
- `pihole/pihole-healthcheck.sh` - Linux healthcheck
- `pihole/pihole-healthcheck.ps1` - Windows PowerShell healthcheck
- `pihole/examples/99-dhcp-dns-fallback.conf.example` - mall för DHCP DNS-fallback (kopiera till `etc-dnsmasq.d/`)
- `pihole/PIHOLE_5_DAGAR_STATUSCHECK.md` - checklista för uppföljning

## 9) Säkerhet och backup (kort)

- Exponera inte Pi-hole admin mot internet.
- Använd starkt adminlösenord i Pi-hole.
- Exportera backup regelbundet via Teleporter i UI.

## 10) Git-baserad återställning

Om du vill kunna återställa snabbt med `git clone`:

- Läs `pihole/GIT_RECOVERY_GUIDE.md`
- Kör restore med `./pihole/scripts/restore-from-repo.sh`
- Verifiera med `./pihole/pihole-healthcheck.sh`

