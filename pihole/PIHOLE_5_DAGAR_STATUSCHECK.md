# Pi-hole statuscheck efter 5 dagar

Använd denna checklista om 5 dagar för att verifiera att allt fungerar stabilt med:

- Blocklista: HaGeZi Pro
- Upstream DNS (IPv4): Cloudflare
- DNSSEC: aktiverat

> Tips: Gör detta när nätverket är i normal användning (inte mitt i stor felsökning).

---

## 1) Snabb hälsokontroll (2 minuter)

Bekräfta i Pi-hole webbgränssnittet:

- Dashboard laddar utan fel
- **Queries blocked** är > 0
- **Percent blocked** ser rimlig ut (ofta ca 10-40%, varierar mellan hem)
- Inga tydliga felmeddelanden i toppen

Om allt ser normalt ut: gå vidare.

---

## 2) Kontrollera att DNS svarar lokalt

Kör från en klient i ditt nätverk:

```bash
nslookup google.com <PIHOLE_IP>
nslookup flurry.com <PIHOLE_IP>
```

Förväntat resultat:

- `google.com` returnerar riktig IP (tillåten domän)
- `flurry.com` blockeras (0.0.0.0/NXDOMAIN eller liknande block-svar)

Om både tillåtna och blockerade domäner beter sig rätt är grundfunktionen OK.

---

## 3) Verifiera container och driftstid

I repo-roten `~/apps/Clanker` (där `docker-compose.yml` ligger), kör:

```bash
cd ~/apps/Clanker
docker compose ps
docker compose logs --since=24h clanker-pihole
```

Kontrollera:

- Tjänsten `clanker-pihole` är `running`
- Inga upprepade crash/restart-loopar
- Inga återkommande DNSSEC- eller upstream-timeoutfel

---

## 4) Bekräfta DNSSEC och upstream-inställning

I Pi-hole GUI -> **Settings -> DNS**:

- `Use DNSSEC` ska vara ikryssad
- Cloudflare IPv4 ska vara vald (helst både `1.1.1.1` och `1.0.0.1`)
- Interface setting: **Allow only local requests**

Om något av ovan avviker: justera och spara.

---

## 5) Granska false positives (viktigaste punkten)

I **Query Log**:

- Filtrera på **Blocked**
- Leta efter domäner som hör till tjänster du faktiskt vill använda
- Whitelista endast exakt domän som behövs (inte hela toppdomäner)

Mål:

- Ingen i hushållet klagar på trasiga appar/sidor
- Du har inte behövt "disable blocking" globalt

---

## 6) Lista och dokumentera ändringar

Skriv kort i denna fil (eller egen logg):

- Vilka domäner du whitelistat
- Eventuella appar/tjänster som behövde justering
- Om du ändrat DNS-inställningar

En enkel loggrad per ändring räcker.

---

## 7) Beslutsregel efter 5 dagar

Om allt fungerar stabilt:

- Behåll nuvarande setup (HaGeZi Pro + Cloudflare + DNSSEC)

Om flera legitima tjänster bryts ofta:

- Behåll listan men fortsätt med selektiv whitelist, **eller**
- testa en mildare HaGeZi-profil

Om du vill öka integritet senare:

- planera migrering till Unbound som lokal resolver

---

## Frivillig månadsrutin (5 minuter)

- Uppdatera container/image
- Uppdatera gravity/blocklists
- Snabb koll i Query Log på nya false positives
- Backup/export av Pi-hole-installningen (Teleporter)

---

## Klarmarkering

Datum för kontroll: `____-__-__`  
Status: `[ ] OK   [ ] Behöver justering`

Kommentar:

`________________________________________________________`

