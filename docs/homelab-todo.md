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

- [ ] *(lägg till nästa funktion eller milstolpe här)*

## Dev tools (`dev-tools-web`)

- [ ] **Dev-server och prod** — tydlig uppdelning (t.ex. två Compose-profiler: prod med nginx/static som idag + separat dev med Vite/volym på Pi, eller prod på Pi och dev endast på laptop); dokumentera när vad ska användas och hur du startar/stänger.

## Övrigt

- [ ] *(t.ex. domän + HTTPS för discord-hub, backup-rutin)*

## Länkade detaljbackloggar

- [homelab-todo-clanker-cli.md](homelab-todo-clanker-cli.md) — **Clanker CLI & QoL:** dispatcher `scripts/clanker`, profiler/up/stop, Linux/PATH-tips, framtida completion m.m.

---

## Klart (arkiv)

<!-- Flytta hit när något är helt färdigt, t.ex.:

- [x] (2025-03) Discord-hub frontend i Docker på Pi

-->
