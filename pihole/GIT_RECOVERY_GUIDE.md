# Git-repo for snabb återställning (Pi-hole)

Målet: kunna göra `git clone` och starta allt igen på en ny/återställd Raspberry Pi.

## 1) Initiera repo (en gång)

I repo-roten `~/apps/Clanker` (efter `git clone`):

```bash
git init
git add .
git status
git commit -m "Initial Pi-hole recovery repo"
```

Skapa sedan ett **privat** remote-repo (GitHub/GitLab) och koppla:

```bash
git remote add origin <DIN_PRIVATE_GIT_URL>
git branch -M main
git push -u origin main
```

## 2) Vad som versionshanteras

- `docker-compose.yml` i repo-roten (kör `docker compose` därifrån)
- `.env.example` i repo-roten (inte din riktiga `.env`)
- `etc-pihole/` viktig konfig (`pihole.toml`, adlists, dnsmasq)
- dokumentation, healthcheck och skript i `pihole/`

`.gitignore` är satt för att undvika hemligheter och brus (leases, cache, TLS-filer, `cli_pw`).

## 3) Vanligt arbetssätt

När du gjort en ändring:

```bash
git add .
git commit -m "Update Pi-hole config"
git push
```

## 4) Återställning på ny Raspberry Pi

Förutsatt att Docker redan är installerat.

```bash
git clone <DIN_PRIVATE_GIT_URL> ~/apps/Clanker
cd ~/apps/Clanker
chmod +x pihole/scripts/*.sh pihole/pihole-healthcheck.sh
./pihole/scripts/restore-from-repo.sh
./pihole/pihole-healthcheck.sh
```

## 5) Om du vill ta med allt exakt

Kör en separat backup-arkivfil:

```bash
cd ~/apps/Clanker
chmod +x pihole/scripts/backup-config.sh
./pihole/scripts/backup-config.sh
```

Det skapar `backups/pihole-config-<datum>.tar.gz`.

Obs: arkivet är lokalt och ignoreras av git som default.

## 6) Viktigt om hemligheter

- Håll repot privat.
- Lägg aldrig in riktiga `.env` med lösenord om repot kan delas.
- Om du *vill* återställa exakt adminlösenord måste du hantera det medvetet (t.ex. hemlig vault), inte i publik git.
