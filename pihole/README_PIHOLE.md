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

### `docker-compose.yml`

- Image: `pihole/pihole:latest`
- Compose-tjänst och containernamn: `clanker-pihole`
- Nätverk: `host`
- Auto-restart: `unless-stopped`
- Volymer:
  - `./etc-pihole -> /etc/pihole`
  - `./etc-dnsmasq.d -> /etc/dnsmasq.d`
- Capability: `NET_ADMIN`
- Miljövariabler laddas från `.env`

### `.env`

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

## 7) Felsökning

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

