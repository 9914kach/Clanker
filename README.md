# Clanker

Homeserver-repo för Raspberry Pi (Clanker) — skript, anteckningar och tjänster som Pi-hole.

- **Remote:** [github.com/9914kach/Clanker](https://github.com/9914kach/Clanker)

## Struktur (växer efter behov)

| Sökväg | Innehåll |
|--------|----------|
| `experiments/` | Isolerade försök och engångsskript |
| `pihole/` | Dokumentation och skript för Pi-hole (själva Compose-filen ligger i repots rot) |

## Docker Compose: var du kör ifrån

**Alla `docker compose`-kommandon körs från repots rot** (mappen där denna `README.md` och `docker-compose.yml` ligger). Då pekar volymsökvägar som `./etc-pihole` och `./etc-dnsmasq.d` rätt. Undermappar som `pihole/` innehåller guider och hjälpskript — inte en egen compose-fil.

När du lägger till fler tjänster kan varje app få en egen undermapp (`pihole/`, `din-webbapp/`, …) med dokumentation, medan antingen (a) en gemensam `docker-compose.yml` i roten växer, eller (b) varje tjänst har `docker-compose.yml` i sin mapp och du kör `docker compose -f <mapp>/docker-compose.yml` från rot med korrekta volymsökvägar — spika ett mönster per tjänst och skriv det i respektive README.

## Ny Pi eller ren installation (kort checklista)

1. Installera Docker (och Compose-plugin) på Pi.
2. `git clone` detta repo till t.ex. `~/apps/Clanker` och `cd` dit.
3. Kopiera `.env.example` till `.env` och justera värden (inga hemligheter i git).
4. `docker compose pull` och `docker compose up -d`.
5. Återställ **persistent data** om du har backup (t.ex. `etc-pihole/`) — compose skapar containrar, inte nödvändigtvis all historik.

## Krav

Beror på respektive del; dokumentera modell av Pi, OS-version och ev. Python/venv i varje undermapp när det spelar roll.
