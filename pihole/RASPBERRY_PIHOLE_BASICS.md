# Raspberry Pi + Pi-hole: från noll till igång

Den här guiden är för nybörjare. Målet är att gå från en tom Raspberry Pi till en fungerande Pi-hole i Docker.

## Snabbspår: servern finns redan (första anslutningen)

Om Raspberryn redan är installerad och igång, börja här.

1. Hitta serverns IP-adress i routern (eller testa `ping <hostname>.local`).
2. Anslut via SSH från din dator:

```bash
ssh <användare>@<pi-ip>
```

Exempel:

```bash
ssh christoffer@192.168.0.2
```

3. Första gången: verifiera fingerprint och skriv exakt `yes`.
4. Verifiera att du är inne:

```bash
hostname
whoami
pwd
```

5. Gå till Pi-hole-projektet och kontrollera status:

```bash
cd ~/apps/pihole
docker compose ps
./pihole-healthcheck.sh
```

Om `clanker.local` inte fungerar, använd IP-adressen direkt i SSH-kommandot.

## 0) Du behöver

- Raspberry Pi (helst Pi 4 eller Pi 5)
- MicroSD-kort (minst 16 GB)
- Nätaggregat till Pi
- Nätverkskabel (rekommenderas för stabil DNS)
- En annan dator (Windows/Mac/Linux) för installation

## 1) Installera Raspberry Pi OS

1. Ladda ner och installera **Raspberry Pi Imager**.
2. Välj:
   - Device: din Pi-modell
   - OS: **Raspberry Pi OS Lite (64-bit)** (utan desktop räcker fint)
   - Storage: ditt microSD-kort
3. Klicka på kugghjulet (Advanced options) och ställ in:
   - hostname (exempel: `clanker`)
   - enable SSH
   - username + password
   - Wi-Fi (om du inte kör kabel)
   - timezone: `Europe/Stockholm`
4. Skriv till SD-kortet.

## 2) Första uppstart

1. Sätt SD-kortet i Pi.
2. Koppla in nätverk (helst kabel) och ström.
3. Vänta 1-2 minuter.

## 3) Hitta Pi:ns IP-adress

Alternativ:
- Kolla i routerns klientlista
- Testa `ping clanker.local`
- Använd nätverksskanner (t.ex. Fing)

När du hittat IP (exempel `192.168.0.2`), notera den.

## 4) Logga in via SSH

Från din dator:

```bash
ssh <användare>@<pi-ip>
```

Exempel:

```bash
ssh christoffer@192.168.0.2
```

## 5) Grundhärdning och uppdatering

Kör på Pi:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl gnupg
sudo reboot
```

Logga in igen efter reboot.

## 6) Installera Docker + Compose plugin

Kör:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

Om `docker compose` saknas:

```bash
sudo apt install -y docker-compose-plugin
```

## 7) Skapa Pi-hole projektmapp

```bash
mkdir -p ~/apps/pihole
cd ~/apps/pihole
```

Skapa `.env`:

```bash
cat > .env << 'EOF'
TZ=Europe/Stockholm
DNSMASQ_LISTENING=all
WEB_PORT=8080
FTLCONF_webserver_port=8080
FTLCONF_dns_interface=eth0
EOF
```

Skapa `docker-compose.yml`:

```bash
cat > docker-compose.yml << 'EOF'
services:
  pihole:
    env_file:
      - .env
    image: pihole/pihole:latest
    container_name: pihole
    hostname: pihole
    network_mode: "host"
    restart: unless-stopped
    volumes:
      - "./etc-pihole:/etc/pihole"
      - "./etc-dnsmasq.d:/etc/dnsmasq.d"
    cap_add:
      - NET_ADMIN
EOF
```

## 8) Starta Pi-hole

```bash
cd ~/apps/pihole
docker compose up -d
docker compose ps
```

Förväntat: service `pihole` är `running`.

## 9) Öppna adminpanelen

I webbläsaren:

- `http://<pi-ip>:8080/admin`
- Exempel: `http://192.168.0.2:8080/admin`

Logga in med Pi-hole adminlösenord (sätt/ändra vid behov med `docker exec` om du inte redan gjort det).

## 10) Minsta rekommenderade Pi-hole-inställningar

I `Settings -> DNS`:

- Upstream DNS (IPv4): Cloudflare `1.1.1.1` och `1.0.0.1`
- Enable DNSSEC
- Interface setting: **Allow only local requests**

I blocklistor:

- Lägg till HaGeZi Pro:
  - `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/pro.txt`

## 11) Låt klienter använda Pi-hole

På router eller per klient, sätt DNS-server till Pi:ns IP (exempel `192.168.0.2`).

Testa från klient:

```bash
nslookup google.com 192.168.0.2
nslookup flurry.com 192.168.0.2
```

`google.com` ska fungera, `flurry.com` ska blockeras.

## 12) Vanliga kommandon

```bash
cd ~/apps/pihole
docker compose ps
docker compose logs --since=24h pihole
docker compose pull && docker compose up -d
```

## 13) Vanliga misstag

- Klient använder fortfarande router/ISP-DNS i stället för Pi-hole
- Pi fått ny IP (lös med DHCP reservation/statisk IP)
- Port/brandvägg blockerar admin-UI
- För aggressiva blocklistor utan whitelist

## 14) Vad du gör efter installation

- Kör healthcheck-script regelbundet
- Följ `PIHOLE_5_DAGAR_STATUSCHECK.md`
- Ta backup i Pi-hole via Teleporter
- Uppdatera Docker image då och då

## 15) Byta lösenord (viktigt)

### Byt lösenord för Linux-användaren (SSH-inloggning)

Kör på Raspberryn:

```bash
passwd
```

Om du vill byta för en specifik användare:

```bash
sudo passwd <användare>
```

### Byt Pi-hole adminlösenord (webbgränssnittet)

Kör:

```bash
docker exec -it pihole pihole setpassword
```

Eller sätt ett specifikt lösenord direkt:

```bash
docker exec -it pihole pihole setpassword "NyttStarktLosenord"
```

Om du vill ta bort lösenord (inte rekommenderat):

```bash
docker exec -it pihole pihole setpassword ""
```

## 16) Tips och tricks att komma ihåg

- Sätt DHCP-reservation i routern så Pi alltid får samma IP.
- Använd två upstream-DNS (t.ex. `1.1.1.1` + `1.0.0.1`) för redundans.
- Exponera inte `:8080/admin` mot internet.
- Whitelista enskilda domäner, inte hela toppdomäner.
- Kör `docker compose logs --since=24h pihole` vid konstiga problem.
- Uppdatera med `docker compose pull && docker compose up -d` någon gång per månad.
- Ta backup via Teleporter innan större ändringar.
- Dokumentera ändringar (vad du vitlistat och varför) i en enkel loggfil.

## Krisruta: 5 kommandon när något strular

Kör dessa på Raspberryn:

```bash
cd ~/apps/pihole
docker compose ps
docker compose logs --since=30m pihole
./pihole-healthcheck.sh
docker inspect -f '{{.State.Status}}' pihole
docker compose restart
```

Tolkning:

- Om `ps` inte visar `running`: containern är nere.
- Om loggar visar återkommande fel: börja där (DNS/upstream/behörighet).
- Om healthcheck failar på DNS: kontrollera klientens DNS-inställning.
- Om status är `running` men problem kvarstår: restart + ny healthcheck.

