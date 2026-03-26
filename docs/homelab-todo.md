# Homelab — TODO / backlog

**Primär backlog** är denna fil. **Fördjupade checklistor** får ligga i separata Markdown-filer under `docs/` när de **länkas härifrån** (samma checkbox-konvention). Övrig planering utanför repot (ticket-system m.m.) används inte tills vidare.

Här samlas **planerade** saker som inte är pågående implementation i kod just nu.  
Uppdatera listan när du börjar eller avslutar något; flytta gärna färdiga punkter till avsnittet längst ner så historiken finns kvar. Uppdatera även länkade detaljfiler när punkter där blir klara.

## Konvention

- `- [ ]` = inte påbörjad  
- `- [x]` = klar (datum i parentes om du vill)  
- Underpunkter med indrag för delsteg eller anteckningar

---

## Infra & drift

- [ ] **VM som homelab-värd (stationär)**  
  - Välj hypervisor (Hyper-V / KVM / VirtualBox) utifrån värd-OS  
  - Ubuntu Server LTS, bridged-nät om egen LAN-IP önskas  
  - SSH, uppdateringar, Docker + ev. autostart av compose vid boot  

## Discord hub

- **Postgres:** körs på **workstation** (Compose-profil `db` där); Pi/API använder `DATABASE_URL` mot desktopens LAN-IP (eller SSH-tunnel). Se [docker.md — PostgreSQL på workstation (LAN)](docker.md#postgresql-på-workstation-lan).
- [x] (2026-03-26) **CLANKER_VISION foundation i discord-hub-web**  
  - Command palette + action-registry i shell  
  - Dashboard som desktop surface med dragbara widgets och context menu  
  - Central ljudprovider med mute-state  
  - Shared wheel beta via Yjs/y-websocket med presence och synkade action-resultat  
- [x] (2026-03-26) **Layout edit — session, undo/redo, spara/kasta, autospara, resize, guider, multival**  
  - Utkast vs sparad layout; dock-verktygsrad; kortkommandon i shell; context menu-paritet  
- [x] (2026-03-26) **Fas 2 — Core customization (HubPrefsPanel + prefs-datamodell)**  
  - Widget-nivå: storlek (compact/cozy/expanded), tone override, glassOpacity, blur, showSubtitle/badge  
  - Desktop-nivå: style packs (default/midnight/paper/signal), gridDensity + snapStrength kopplade till layout, dock position + scale, animationsintensitet  
  - Copy/ton: personality (calm/normal/chaotic), toast-verbositet, meme-frekvens  
  - UI: `HubPrefsPanel` (slide-in panel, flikar Widget/Desktop/Ton) via "Anpassa"-knapp i headern  
  - Prefs sparas i `localStorage` via `hub.prefs.v1`; i18n för SV + EN  
- [ ] **Fas 3–4** — backend-sync av prefs, temamigration, per-widget egna ikoner/paletter, global personalitets-copy i alla strängar

## Dev tools (`dev-tools-web`)

- [ ] **Dev-server och prod** — tydlig uppdelning (t.ex. två Compose-profiler: prod med nginx/static som idag + separat dev med Vite/volym på Pi, eller prod på Pi och dev endast på laptop); dokumentera när vad ska användas och hur du startar/stänger.

## Övrigt

- [ ] *(t.ex. domän + HTTPS för discord-hub, backup-rutin)*

## Länkade detaljbackloggar

- [homelab-todo-clanker-cli.md](homelab-todo-clanker-cli.md) — **Clanker CLI & QoL:** dispatcher `scripts/clanker`, profiler/up/stop, Linux/PATH-tips, framtida completion m.m.

---

## Klart (arkiv)

- [x] (2026-03) **Clanker CLI-backlog** enligt [homelab-todo-clanker-cli.md](homelab-todo-clanker-cli.md): `down`, `doctor`, delad `clanker-root.sh`, tab completion, `--build`-fix, doc/README.

<!-- Flytta hit när något är helt färdigt, t.ex.:

- [x] (2025-03) Discord-hub frontend i Docker på Pi

-->
