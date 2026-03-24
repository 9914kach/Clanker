# Homelab — TODO / backlog

**Tills vidare:** enda backlogen är denna Markdown-fil i repot (ingen separat ticket-/PM-tjänst).

Här samlas **planerade** saker som inte är pågående implementation i kod just nu.  
Uppdatera listan när du börjar eller avslutar något; flytta gärna färdiga punkter till avsnittet längst ner så historiken finns kvar.

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

---

## Klart (arkiv)

<!-- Flytta hit när något är helt färdigt, t.ex.:

- [x] (2025-03) Discord-hub frontend i Docker på Pi

-->
