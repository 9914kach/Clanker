# Fas 1+ — Unified Shell Grid (väg framåt)

**Beroende:** [unified-shell-grid-fas0.md](unified-shell-grid-fas0.md) (godkänd terminologi och policy).

Detta dokument **utreder** och **skissar** nästa steg; det ersätter inte kodgranskning eller slutlig API-design.

---

## 1. Desktop Edit vs Shell Edit — implementation av `layoutEditMode`

### Nuläge

- `HubLayout` håller en bool `layoutEditMode` persistad som `hub.shell.layoutEdit.v1`.
- Samma flagga styr: (a) dashboard widget drag/resize i `HubDesktopSurface`, (b) reorder-grepp i `HubShellReorderablePrimaryNav`, (c) inert/pointer-events på route-innehåll, (d) dock layout-verktygsrad.

### Målbild (från Fas 0)

Två konceptuella lägen: `desktopEditActive` och `shellEditActive`, med **regeln** att högst ett **layout-mutation-läge** är aktivt åt gången (rekommenderat i Fas 1).

### Implementationsalternativ

| Alternativ | Beskrivning | Fördel | Nackdel |
|------------|-------------|--------|---------|
| **A. Två booleska flaggor + guard** | `desktopEditActive`, `shellEditActive`; vid aktivering av den ena stängs den andra (eller visa varning). | Tydlig separation; enkel att förklara i copy. | Två entry points i UI (eller en modal “vad vill du redigera?”). |
| **B. Enum-läge** | `layoutEdit: "off" \| "desktop" \| "shell"`. | Ett tillstånd, ingen dubbel aktivitet. | Kräver migrering från `hub.shell.layoutEdit.v1` (läs gammal bool som `"desktop"` eller mappa till ny default). |
| **C. Behåll en toggle, underlägen i panel** | En “redigera layout” som öppnar verktygsrad med flikar Desktop / Shell. | Mindre förändring av chrome. | Risk att användare blandar fortfarande om flikar är otydliga. |

**Rekommendation för Fas 1:** **B** (`layoutEdit` enum) med **persistens** i nyckel t.ex. `hub.shell.layoutEditMode.v2` och engångsmigrering: `true` → `"desktop"` (bibehåller nuvarande beteende för befintliga användare) eller `"both"` endast om produkt medvetet vill behålla kombinerat läge tillfälligt.

### Kodpunkter att röra (senare)

- [HubLayout.tsx](../apps/discord-hub-web/src/components/HubLayout.tsx): state, localStorage, kortkommandon, `inert`.
- [HubShellReorderableChrome.tsx](../apps/discord-hub-web/src/components/HubShellReorderableChrome.tsx): reorder endast när `layoutEdit === "shell"` (eller motsvarande).
- [Dashboard.tsx](../apps/discord-hub-web/src/pages/Dashboard.tsx) / `HubDesktopSurface`: spatial edit endast när `layoutEdit === "desktop"`.
- [hub-shell-menu.ts](../apps/discord-hub-web/src/lib/hub-shell-menu.ts): separata menysektioner / etiketter per läge (copy via `hub-copy.ts`).
- [hub-actions.ts](../apps/discord-hub-web/src/config/hub-actions.ts): ev. två actions eller en action med parameter.

### i18n

Nya strängar: titlar/beskrivningar för lägena, bekräftelse vid byte av läge, tom tillstånd när fel läge är aktivt — alla under t.ex. `copy.editMode.*` (SV + EN).

---

## 2. Additiv payload: `orderedLists`, `containers`, synk

### Mål

- Shell-ordning (primär nav, bokmärken, dock-pins) ska kunna **samma** `GET`/`PUT /api/me/hub-settings` som prefs och `desktopLayout`.
- **Ingen breaking change:** befintliga klienter ignorerar okända nycklar; server lagrar JSONB som idag.

### Föreslagen utökning av `HubSettingsPayload` (koncept)

Utöver `version`, `prefs`, `desktopLayout`, `layoutAutosaveEnabled`:

```text
unifiedShellGrid?: {
  version: 1,
  orderedLists: {
    "primaryNav"?: { itemIds: string[] },
    "navBookmarks"?: { itemIds: string[] },
    "dockPins"?: { itemIds: string[] }
  },
  containers?: Record<string, {
    parentId: string | null,
    kind?: string
  }>
}
```

- **`orderedLists`:** nycklar är **stabila list-id** (engelska); innehåll är `itemIds` i visningsordning. Validering i API: varje id måste vara tillåtet för listan (whitelist per list-id).
- **`containers`:** valfritt i första leveransen; kan tom tills fler ytor än root behövs.
- **Merge:** server `updated_at` + befintlig `lastLocalWriteMs`-logik; vid konflikt samma princip som för prefs (produktbeslut: last-write-wins eller fältvis merge).

### Zod / API (discord-hub-api)

- Utöka validering av `payload` i Hono-route för hub-settings med **`.passthrough()`** eller **optional** nested schema så att gamla dokument utan `unifiedShellGrid` fortfarande validerar.
- Versionera **`unifiedShellGrid.version`** separat från `HubSettingsPayload.version` om understrukturen evolverar oftare.

### Web (discord-hub-web)

- [hub-settings-sync.ts](../apps/discord-hub-web/src/lib/hub-settings-sync.ts): typ + merge/push av `unifiedShellGrid`.
- Migrera **read path:** om server har `orderedLists`, använd dem; annars fall tillbaka till `localStorage` (`hub.shell.primaryNavOrder.v1`, m.fl.) och **lazy push** vid nästa sparad PUT.
- [use-hub-settings-sync.ts](../apps/discord-hub-web/src/hooks/use-hub-settings-sync.ts): trigga sync när listor ändras i Shell Edit.

### Ordning mot befintlig data

1. Definiera **canonical list-id** och **item-id** som matchar nuvarande kod (`DEFAULT_PRIMARY_NAV_ORDER`, bokmärkes-id, dock tool ids).
2. Skriv **en** `normalizeOrderedLists()` som fyller saknade id och tar bort okända (som `mergeOrderWithDefaults` idag).
3. Tester: roundtrip localStorage → payload → server → annan klient.

---

## 3. Checklista innan Fas 1 kodas

- [ ] Stakeholder har godkänt Fas 0 ([unified-shell-grid-fas0.md](unified-shell-grid-fas0.md)).
- [ ] Valt enum vs två bools för edit-läge.
- [ ] Lista vilka `orderedLists` som ingår i MVP (t.ex. enbart `primaryNav` först).
- [ ] API-schema och migrering av tom `unifiedShellGrid` dokumenterad för drift.

---

<<<<<<< ours
## 4. Leverabler per iteration (RACI + acceptance criteria)

> Syfte: göra arbetet styrbart och repeterbart med tydligt ansvar, godkännande, samråd och informationsflöde.

| Iteration | Leverabler | Responsible (utför) | Accountable (godkänner) | Consulted (säkerhet/drift) | Informed (ledning/support) |
|-----------|------------|----------------------|---------------------------|-----------------------------|----------------------------|
| **I1 — Edit mode-kontrakt** | Inför `layoutEditMode.v2` som enum (`off \| desktop \| shell`) + migrering från `hub.shell.layoutEdit.v1`; uppdaterad copy i SV/EN | **Frontend Lead** | **Produktägare (PO)** | **Säkerhetsansvarig**, **SRE/Driftansvarig** | **Engineering Manager**, **Support Lead** |
| **I2 — API & payload** | Additiv `unifiedShellGrid` i `HubSettingsPayload`; validering i API med bakåtkompatibilitet; dokumenterad merge-strategi | **Backend Lead** | **Tech Lead** | **Säkerhetsansvarig**, **SRE/Driftansvarig** | **Engineering Manager**, **Support Lead** |
| **I3 — Web-sync & fallback** | Web-klient läser/skriv `orderedLists`; fallback från localStorage; lazy push vid nästa `PUT`; telemetri för sync-fel | **Frontend Lead** | **Tech Lead** | **SRE/Driftansvarig**, **Säkerhetsansvarig** | **Produktägare (PO)**, **Support Lead** |
| **I4 — Verifiering & release readiness** | E2E-smoke, rollback-check, release-notes, support-runbook för nya edit-lägen | **QA Lead** | **Release Manager** | **SRE/Driftansvarig**, **Säkerhetsansvarig** | **Engineering Manager**, **Support Lead**, **Produktägare (PO)** |

### Acceptance criteria per iteration (roll + deadline)

#### I1 — Edit mode-kontrakt

1. **Migrering fungerar för befintliga användare** (`true` → `desktop`, `false` → `off`) utan förlust av layoutdata.  
   - **Ägare:** Frontend Lead  
   - **Deadline:** **2026-04-08**
2. **Shell-reorder är inaktivt i `desktop`-läge och aktivt i `shell`-läge** enligt policy i Fas 0.  
   - **Ägare:** Frontend Lead  
   - **Deadline:** **2026-04-08**
3. **SV/EN-copy för edit-lägen finns och används i UI** (inga hårdkodade strängar).  
   - **Ägare:** Frontend Lead  
   - **Deadline:** **2026-04-09**
4. **PO sign-off på interaktionsflöde** efter demo.  
   - **Ägare:** Produktägare (PO)  
   - **Deadline:** **2026-04-10**

#### I2 — API & payload

1. **`GET`/`PUT /api/me/hub-settings` accepterar payload både med och utan `unifiedShellGrid`**.  
   - **Ägare:** Backend Lead  
   - **Deadline:** **2026-04-15**
2. **Schema-validering blockerar ogiltiga `itemIds` per list-id** med tydligt felmeddelande.  
   - **Ägare:** Backend Lead  
   - **Deadline:** **2026-04-15**
3. **Säkerhetsgranskning av payload-yta klar** (input-validering, storleksgränser, missbruksfall).  
   - **Ägare:** Säkerhetsansvarig  
   - **Deadline:** **2026-04-16**
4. **Drift har godkänt deploy/rollback-rutin för schemaändringen**.  
   - **Ägare:** SRE/Driftansvarig  
   - **Deadline:** **2026-04-17**

#### I3 — Web-sync & fallback

1. **Klient använder `orderedLists` från server när tillgängligt, annars fallback till localStorage**.  
   - **Ägare:** Frontend Lead  
   - **Deadline:** **2026-04-22**
2. **Lazy push från fallback-data till server sker exakt en gång per profil** (idempotent).  
   - **Ägare:** Frontend Lead  
   - **Deadline:** **2026-04-22**
3. **Konfliktpolicy (last-write-wins eller fältvis merge) är implementerad och dokumenterad**.  
   - **Ägare:** Tech Lead  
   - **Deadline:** **2026-04-23**
4. **Support har verifierat felsökningssteg för synkavvikelser i runbook**.  
   - **Ägare:** Support Lead  
   - **Deadline:** **2026-04-24**

#### I4 — Verifiering & release readiness

1. **E2E-smoke passerar på staging för Desktop Edit + Shell Edit + sync**.  
   - **Ägare:** QA Lead  
   - **Deadline:** **2026-04-29**
2. **Rollback-test är genomfört utan dataförlust i `hub_user_settings.payload`**.  
   - **Ägare:** Release Manager  
   - **Deadline:** **2026-04-29**
3. **Release notes och support-runbook publicerade och kommunicerade**.  
   - **Ägare:** Release Manager  
   - **Deadline:** **2026-04-30**
4. **Slutligt go/no-go-beslut dokumenterat** med signerad ansvarskedja (RACI).  
   - **Ägare:** Engineering Manager  
   - **Deadline:** **2026-04-30**
=======
## 4. Datahantering (granskningsplan)

### 4.1 Klassning av artefakter

Varje artefakt som tas fram under analys, test och verifiering ska märkas med en informationsklass innan den delas:

| Artefakt | Exempel | Klass |
|----------|---------|-------|
| Publik dokumentation | Beslutsunderlag utan miljöspecifika detaljer | **Publik** |
| Intern drift-/debug-dokumentation | Interna flödesbeskrivningar, icke-publik topologi | **Intern** |
| Råloggar och export med potentiella identifierare | request/response-loggar, Teleporter-export, debug-token-spår | **Känslig** |

**Minimikrav:** klassning måste vara explicit i artefaktens header eller ärendetext innan bilaga.

### 4.2 Maskningsregler före delning

Innan en artefakt delas utanför ursprunglig felsökningskontext ska följande maskning tillämpas:

- Klient-IP ska hash:as (stabil env-saltad hash), aldrig visas i klartext.
- Interna zonnamn, hostnames och interna URI:er ska redigeras eller ersättas med neutrala alias.
- Tokens, session-id och korrelations-id med säkerhetsvärde ska maskas eller trunkeras.
- Person-/kontoidentifierare som inte behövs för felsökningen ska pseudonymiseras.

**Policy:** om osäkerhet finns, behandla artefakten som **känslig** och maska innan delning.

### 4.3 Retention-policy

Grundpolicy för lagringstid (om inte striktare regel gäller i incident eller avtal):

- **Råloggar:** 14 dagar.
- **Sanerade rapporter / sammanfattningar:** 90 dagar.
- **Temporära felsökningsutdrag:** rensas så snart ärendet är stängt, senast inom 14 dagar.

Avvikelser ska dokumenteras med orsak, ägare och slutdatum för extra retention.

### 4.4 Delningspolicy: debug-token och Teleporter-export

`debug-token` och `Teleporter`-export ska hanteras i separat flöde:

- Delas endast via separat, avsedd kanal (inte i öppna issue-/PR-kommentarer).
- Åtkomst ska vara tidsbegränsad och minimerad till berörda mottagare.
- Länkar/exporter ska ha utgångstid och återkallas när felsökningen är klar.
- Referens i ärende/PR ska peka på **att** material finns, men inte innehålla hemligt innehåll.

### 4.5 Obligatorisk checklista före bilaga i ärende/PR

Följande punkter måste passera innan artefakter bifogas i issue, incident eller PR:

- [ ] Artefakt har klassning: publik / intern / känslig.
- [ ] Maskning är genomförd enligt policy (IP, zonnamn, tokens, identifierare).
- [ ] Retention-tid är satt enligt policy och dokumenterad.
- [ ] Eventuell debug-token/Teleporter-export delas i separat kanal med tidsbegränsad åtkomst.
- [ ] Ägare för artefakten är utsedd (vem ansvarar för borttag/rensning).
- [ ] Slutkontroll gjord: inga känsliga råvärden kvar i bilagan.
>>>>>>> theirs
