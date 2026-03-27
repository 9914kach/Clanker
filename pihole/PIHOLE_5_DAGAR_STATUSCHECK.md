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


## 7b) Tolkning och heuristiska trösklar

För att bedöma stabilitet konsekvent, följ samma mätmodell vid varje uppföljning:

1. **Tre mätserier (måste finnas i samma körning):**
   - cache-hit: `p50` och `p95`
   - cache-miss: `p50` och `p95`
   - andel felkoder: `SERVFAIL` + `NXDOMAIN` som andel av total query-volym
2. **Fast mätfönster:**
   - Basfönster: senaste **24h**
   - Peakfönster: sammanhängande **2h** med högst query-volym inom samma dygn
3. **Tydlig query-tagging i SQL/loggparser:**
   - Märk varje rad som minst `cache_hit` eller `cache_miss` innan aggregering
   - Exempel på enkel SQL-idé: `CASE WHEN cached = 1 THEN 'cache_hit' ELSE 'cache_miss' END AS query_tag`
   - Säkerställ att parsern även normaliserar svarskod så `SERVFAIL`/`NXDOMAIN` kan räknas exakt
4. **Go/No-go-regel (hård):**
   - **Go** endast om **alla tre** mätserier ligger inom definierade gränser i både 24h- och 2h-fönster
   - **No-go** om någon serie bryter gränsen i något av fönstren

> Rekommendation: dokumentera tröskelvärden i samma loggrad som mätresultatet (ex. `hit_p95_ms<=X`, `miss_p95_ms<=Y`, `servfail_nxdomain_pct<=Z`) för spårbarhet.

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


## Separat rollback-avsnitt

Använd detta avsnitt om en förändring orsakar avbrott eller om någon gate i verifieringen fallerar.

### Exakt ordning (måste följas)

1. **Återställ konfig** till senast känd fungerande version.
2. **Restart** av tjänster (minst `clanker-pihole`, vid behov hela compose-stacken).
3. **DNS-smoke** (3 snabba tester mot tillåten + blockerad domän).
4. **Policy-smoke** (bekräfta att policy/filterregler beter sig enligt förväntan).
5. **Portscan** (bekräfta att endast avsedda portar är öppna).

> Kör stegen i exakt ordning ovan. Hoppa inte över steg även om ett tidigare steg ser grönt ut.

### Minimikrav för status “recovered”

Sätt status till **recovered** först när samtliga krav är uppfyllda:

- **DNS-smoke: 3/3 passerar** (alla tre tester gröna).
- **Inga FTL-fel senaste 10 minuterna** i logg.
- Policy-smoke visar förväntat resultat utan regressionsfel.
- Portscan visar inga oplanerade/exponerade portar.

### Eskaleringsregel om gate fallerar

Om någon gate fallerar (DNS-smoke, policy-smoke eller portscan):

- **Freeze:a ändringar direkt** (inga fler config- eller deploy-ändringar).
- **Återgå till senaste image/backup** enligt återställningsrutin.
- Dokumentera fel, tidpunkt och vilken gate som fallerade innan nya försök.

### Protokollmall (signeras av ansvarig)

Kopiera mallen nedan vid varje rollback/recovery:

```text
Rollback-/Recovery-protokoll

Datum: ____-__-__
Starttid (UTC): __:__
Sluttid (UTC): __:__
Ansvarig (namn): ____________________
Signatur: ____________________

Trigger/incident:
- ________________________________________________

Genomförd ordning (markera):
[ ] 1) Återställ konfig
[ ] 2) Restart
[ ] 3) DNS-smoke
[ ] 4) Policy-smoke
[ ] 5) Portscan

Gate-resultat:
- DNS-smoke: [ ] 3/3 pass   [ ] Ej godkänd
- FTL-fel senaste 10 min: [ ] Inga fel   [ ] Fel finns
- Policy-smoke: [ ] Godkänd   [ ] Ej godkänd
- Portscan: [ ] Godkänd   [ ] Ej godkänd

Slutstatus:
[ ] Recovered
[ ] Eskalerad (freeze + återgång till senaste image/backup)

Kommentarer/åtgärder:
- ________________________________________________
- ________________________________________________
```

---

## Klarmarkering

Datum för kontroll: `____-__-__`  
Status: `[ ] OK   [ ] Behöver justering`

Kommentar:

`________________________________________________________`

