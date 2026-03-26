# Fas 0 — Unified Shell Grid (beslutsunderlag)

**Status:** beslutsunderlag (ingen kodändring i denna fas).  
**Språk:** analys på svenska; **modellnycklar** på engelska (`widget`, `container`, `shellObject`, `child`, `move`, `resize`, `reorder`, `hide`).

**Nuläge (referenser):**

- [hub-desktop-layout.ts](../apps/discord-hub-web/src/lib/hub-desktop-layout.ts)
- [hub-dashboard-layout-storage.ts](../apps/discord-hub-web/src/lib/hub-dashboard-layout-storage.ts)
- [hub-shell-object-kinds.ts](../apps/discord-hub-web/src/lib/hub-shell-object-kinds.ts)
- [hub-shell-context.ts](../apps/discord-hub-web/src/lib/hub-shell-context.ts)
- [HubLayout.tsx](../apps/discord-hub-web/src/components/HubLayout.tsx) (`layoutEditMode`, `LAYOUT_EDIT_KEY`)
- [hub-settings-sync.ts](../apps/discord-hub-web/src/lib/hub-settings-sync.ts) (`HubSettingsPayload`)
- [003_hub_user_settings.sql](../apps/discord-hub-api/migrations/003_hub_user_settings.sql)

---

## 1. Problembild (kort)

Idag finns **två typer av “layout”** som delvis överlappar i UX men har **olika datamodeller och persistens**:

- **Skrivbordsytan (dashboard):** moduler med **pixelrutnät** (`HubDesktopWidgetLayout`: position, storlek, z, `hidden`). Redigering sker under en global **`layoutEditMode`** med undo/redo-utkast och synk via `HubSettingsPayload.desktopLayout` (+ `layoutAutosaveEnabled`).
- **Skal-krom (nav, zoner):** `HubShellObject` + `HubShellObjectKind` för kontext/annotering; **primär navigationsordning** lagras separat (`hub.shell.primaryNavOrder.v1`, [hub-shell-layout-order.ts](../apps/discord-hub-web/src/lib/hub-shell-layout-order.ts)) och **reorder-affordance** i [HubShellReorderableChrome.tsx](../apps/discord-hub-web/src/components/HubShellReorderableChrome.tsx) är kopplad till **samma** `layoutEditMode` som skrivbordet.

**Konsekvens:** begreppen “widget”, “shell-yta” och “ordnad lista” blandas i ett enda redigeringsläge; framtida enhetlig **shell grid** (en gemensam mental modell för vad som får flyttas, storleksändras, ordnas om och döljas) saknar **låsta definitioner och capability-regler**.

Fas 0 ska låsa **terminologi**, **operationer per typ** och **policy för redigeringslägen** så att Fas 1+ kan implementeras utan omtagning av grundbegrepp.

---

## 2. Begreppsdefinitioner

Alla **identifierare i modell/API** på engelska och stabila (`widget`, `container`, `shellObject`, `child`). UI-etiketter går via copy (SV/EN), se [avsnitt 6](#6-i18n-implikationer).

### 2.1 `widget`

**Definition:** En **innehållsmodul på skrivbordsytan** (Neutralen OS “app-fönster” på dashboard) med **eget layoutrecord** i det **desktop spatial grid** (bassteg 16 px, snap enligt prefs).

**Ansvar:** Presentera innehåll; delta i **collision/stacking** mot andra widgets; ägars **spatial state** (position, storlek, z, synlighet i grid).

**Inte:** Primär navigeringslist i headern (det är shell-children), även om kontextmenyn kan bete sig liknande.

**Nuvarande motsvarighet:** poster i `desktopLayout` keyed by `widgetId`; `HubContextTarget` med `type: "widget"`.

### 2.2 `container`

**Definition:** En **logisk layout-yta** som **äger** en uppsättning **children** (spatial och/eller ordnad) och tillämpar **regler** (grid, padding, overflow, vilka operationer som propageras).

**Ansvar:** Avgränsa var **move/resize** får ske; kan nästlas (container inuti container) i en framtida enhetlig modell.

**Nuvarande motsvarighet (konceptuellt):** “desktop zone” som faktisk DOM-yta där widgets placeras; eventuellt framtida **explicit** container-typ i payload (idag implicit).

**Fas 0-beslut:** `container` är **modellprimär** — även om dagens UI bara har en platt widgetlista, ska framtida unified grid kunna införa **flera containers** utan att byta namn på `widget`.

### 2.3 `shellObject`

**Definition:** Ett **annoterat skal-element** som Neutralen OS känner igen för **kontextmeny, inspektion, tillgänglighet och (valfritt) layout-edit**. Har **`objectId`** (stabilt) och **`kind`** (taxonomi, t.ex. `navGroup`, `desktopZone`, `dockBar` — se [hub-shell-object-kinds.ts](../apps/discord-hub-web/src/lib/hub-shell-object-kinds.ts)).

**Ansvar:** Koppla **UI-DOM** till **skal-beteende**; kan vara **icke-spatial** (t.ex. brand) eller **spatial** (t.ex. `desktopZone`).

**Skiljer sig från `widget`:** `shellObject` beskriver **skal-krom och zoner**, inte dashboard-modulens affärsinnehåll. En `widget` kan ligga **inne i** en `shellObject` av kind `desktopZone`.

**Nuvarande motsvarighet:** `HubShellObject` + `HubContextTarget` med `type: "shell.object"`.

### 2.4 `child`

**Definition:** En **medlem i en förälders ordning eller hierarki**. En `child` har alltid en **`parentRef`** (konceptuellt: container-id, lista-id eller shellObject-id beroende på kontext).

**Typer av child-relation (Fas 0):**

1. **Ordered child:** ordnad sekvens (t.ex. primär nav, bokmärken, dock-pins) — **reorder** är den dominerande operationen.
2. **Spatial child:** placerad i förälderns grid — **move/resize** (inom bounds) + ev. **z** som reorder inom sibling-grupp.

**Samma entitet** kan i modellen beskrivas som `widget` **och** som `child` av en `container` (roll, inte dubbel data).

**Nuvarande motsvarighet:** nav-items som reorderas under `layoutEditMode`; widgets som barn till desktop-ytan.

---

## 3. Capability-matris

Operationerna är **konceptuella** (implementationsagnostiska). **Reorder** = ändra **relativ ordning** i en definierad lista **eller** **stacking order** bland syskon i samma spatial yta.

| Type | Move | Resize | Reorder | Hide | Notes / Constraints |
|------|------|--------|---------|------|---------------------|
| **widget** | Ja (i desktop container) | Ja (grid-bundet, min/max enligt produktregler) | Ja (som **z** / stacking bland syskon) | Ja (`hidden` + ev. “spawn”-återställning) | Spatial state ägs av widget/layoutrecord. Move/resize **inaktiva** utanför **Desktop Edit** (se policy). |
| **container** | Ja *om* produkt tillåter flytt av hela ytor (Fas 1+ beslut) | Ja *om* produkt tillåter storleksändring av yta | Ja *om* children är ordnad lista; annars N/A för spatial | Ja (kollaps/dölj yta — **risk:** döljer alla barn; kräver tydlig UX-copy) | Fas 0: **primärt** bounds + regler för barn; **default** kan vara endast **root desktop container** flyttas inte. |
| **shellObject** | **Villkorligt:** endast om objektet är **spatial shell chrome** (t.ex. zone) *och* produkt öppnar för grid-placering | **Villkorligt:** samma som move | **Villkorligt:** om objektet **agerar lista** (t.ex. navGroup med flera items) | **Villkorligt:** “dölj chrome” (t.ex. ticker) — **inte** samma som widget hide | Icke-spatiala shellObjects (brand, delar av dock): **move/resize oftast Nej**; prefs/drag-separat kan ersätta. **Reorder** för **list-baserad** chrome under **Shell Edit**. |
| **child** (ordered) | Nej (position följer lista) | Nej | Ja | Ja (om förälder stöder dold rad — t.ex. dold navpost) | **Reorder** = permutation av `parentRef`-lista. |
| **child** (spatial) | Ja (inom förälder) | Ja (inom förälder) | Ja (z bland syskon) | Ja (ärver widget/container-regler) | Samma capabilities som **widget** när child **är** en widget; annars produktdefinierat. |

**Fas 0-prioritet:** lås att **widget** alltid har **move, resize, reorder(z), hide** på desktop under rätt läge; **shellObject** får **inte** automatiskt alla fyra — **kind** + **spatial vs list** styr.

---

## 4. Edit-mode policy: Desktop Edit vs Shell Edit

### 4.1 Syfte

Separera **vad användaren tror de redigerar** och **vilken data som muteras**, så att unified grid senare kan **merge:a regler** utan att blanda spatial draft med listordning.

### 4.2 Desktop Edit (arbetsnamn)

- **Gäller:** `widget` (spatial) inuti **desktop `container`**.
- **Operationer:** move, resize, z-reorder, hide; grid snap; multi-select; undo/redo för **desktop layout draft** (motsvarar dagens dashboard edit-session).
- **Gäller inte:** primär navigations **list-reorder** (flyttas till Shell Edit om policy adopteras).

### 4.3 Shell Edit (arbetsnamn)

- **Gäller:** **shellObject**- och **ordered child**-strukturer: primär nav, bokmärkesordning, ev. dock-pin-ordning, framtida chrome som är **lista-baserad**.
- **Operationer:** **reorder** (primär), **hide** för chrome-rader där det är meningsfullt; **move/resize** endast om specifik chrome är **spatial** i en framtida grid (annars **Nej** — ersätts av prefs som idag för dock position/scale).

### 4.4 Övergång från nuläge

**Nuläge:** en **`layoutEditMode`** aktiverar **både** desktop-widget-redigering **och** nav reorder ([HubShellReorderableChrome.tsx](../apps/discord-hub-web/src/components/HubShellReorderableChrome.tsx)).

**Rekommendation (Fas 0):** målsätt två **konceptuella lägen** (`desktopEditActive`, `shellEditActive`) med **regel:** högst ett aktivt **layout-mutation-läge** åt gången, eller **tydlig visuell hierarki** om båda tillåts (undvik i Fas 1 om möjligt). **Migrering:** befintlig `layoutEditMode` kan mappas till **Desktop Edit** **eller** **båda** tills UI delas — **ingen API-ändring i Fas 0**.

### 4.5 Prefs vs Edit-läge

**Dock position/scale, desktop style pack, grid density** förblir **prefs** ([hub-prefs.ts](../apps/discord-hub-web/src/lib/hub-prefs.ts)), **inte** move/resize i spatial grid — så att capability-matrisen inte blandas ihop med **tematiska** inställningar.

---

## 5. Konceptuell datamodell (ingen kod)

**Mål:** bakåtkompatibel med **`HubSettingsPayload`** (`version`, `prefs`, `desktopLayout`, `layoutAutosaveEnabled`).

### 5.1 Nuvarande “sanning”

- **`prefs`:** `HubPrefs` (widgetVisualById, desktop, dock, motion, copyStyle, inspectCursor, …).
- **`desktopLayout`:** `Record<widgetId, HubDesktopWidgetLayout>`.
- **Nav order / övrig shell-listdata:** delvis **endast localStorage** idag — **känd gap** mot unified sync (utanför Fas 0 implementation).

### 5.2 Föreslagen utökning (senare faser, frivillig nyckel)

Lägg **vid sidan av** befintliga nycklar (inte ersätt):

```text
unifiedShellGrid: {
  version: number,
  containers: Record<containerId, { parentId?: string | null, spatial?: SpatialLayout, kind?: string }>,
  shellObjects: Record<objectId, { kind: HubShellObjectKind, containerId?: string, ... }>,
  orderedLists: Record<listId, { parentRef: string, itemIds: string[] }>
}
```

**Bakåtkompatibilitet:** om `unifiedShellGrid` saknas, **härled** modellen från `desktopLayout` + kända defaults (som idag). **Ingen breaking change** av befintliga fält i Fas 0.

### 5.3 Identiteter

- **`widgetId`:** befintliga strängnycklar (t.ex. `welcome`, `server-pulse`).
- **`objectId`:** stabila strängar (redan i `HubShellObject`, t.ex. `desktop.utility.spawn`).
- **`containerId`:** nya stabila id vid införande; root desktop kan vara konstant t.ex. `desktop.root`.

Detaljerad utformning av Zod-scheman, merge mot server och migrering från localStorage beskrivs i [unified-shell-grid-fas1.md](unified-shell-grid-fas1.md).

---

## 6. i18n-implikationer

- **Alla nya användarsynliga etiketter** (lägesnamn, förklaringar, fel/confirm för “dölj container”, shell vs desktop) ska gå via [hub-copy.ts](../apps/discord-hub-web/src/i18n/hub-copy.ts) med **parallella** `sv` / `en` poster — **inga hårdkodade strängar** i komponenter.
- **Modell/API:** behåll **engelska** tekniska nycklar (`widget`, `container`, `shellObject`, `child`, operationerna `move`, `resize`, `reorder`, `hide`).
- **Namngivning i copy:** använd **beskrivande nycklar** (t.ex. `editMode.desktop.title`, `editMode.shell.hint`, `capability.hide.widget`) så att **översättning** kan vara idiomatisk utan att ändra kod — undvik att översätta typnamn i UI till samma ord som i API om det blir otydligt; visa **lokaliserat** namn + ev. tooltip med neutral förklaring.
- **ShellObjectKind:** befintliga / nya `kind`-värden ska ha **copy-mappning** (t.ex. `chrome.shellObjectKind.desktopZone`) för skärmläsare och menyer.

---

## 7. ADR: Unified Shell Grid — terminologi och redigeringsregler (Fas 0)

### Status

Föreslagen (Fas 0 — beslut). Ingen implementation i denna fas.

### Kontext

Discord-hub-web (Neutralen OS) har skrivbordsmoduler med spatial layout och skal-krom med separat ordningsdata. En global layout-edit-flagga styr flera olika interaktioner. Vi behöver en gemensam modell för framtida “unified shell grid”.

### Beslut

1. Fyra begrepp används konsekvent: **widget**, **container**, **shellObject**, **child** (engelska i modell; UI copy lokaliserad).
2. Capabilities **move**, **resize**, **reorder**, **hide** tilldelas per typ enligt capability-matris; **shellObject** är **kind- och kontextberoende** — inte full sats som standard.
3. Två redigeringslägen definieras konceptuellt: **Desktop Edit** (spatial widgets) och **Shell Edit** (list-baserad chrome + ev. spatial shell senare). Migrering från en enda `layoutEditMode` är medveten teknisk skuld som adresseras i senare fas.
4. Datamodell utökas **additivt** mot `HubSettingsPayload`; befintliga `prefs` och `desktopLayout` förblir canonical tills migrering är klar.

### Konsekvenser

**Positivt**

- Tydlig grund för UX, sync och kontextmeny.
- i18n: stabila nycklar, inga hårdkodade UI-strängar.

**Negativt / risk**

- Tillfällig dubbelhet: gammalt single-toggle vs nya lägen.
- `container` och utökad `shellObject`-spatialitet kräver extra UX för hide av ytor.

### Alternativ som avvisats (Fas 0)

- **Total omskrivning** av layoutsystemet utan migreringsväg.
- **Ett begrepp “tile”** för allt — för vagt för att skilja chrome vs innehållsmodul.

---

## Sammanfattning för godkännande

| Område | Fas 0-låsning |
|--------|----------------|
| **widget** | Spatial dashboard-modul; move/resize/z/hide under Desktop Edit. |
| **container** | Layout-yta med barn; regler och bounds; utökad roll i senare fas. |
| **shellObject** | Annoterad skal-yta/kind; capabilities **villkorliga** — inte default allt. |
| **child** | Medlem i lista eller grid; reorder vs spatial capabilities skiljs. |
| **Edit-lägen** | Desktop Edit vs Shell Edit; nuläge = en kombinerad toggle (teknisk skuld noterad). |
| **Data** | Additiv utökning; befintlig `hub_user_settings.payload` + `HubSettingsPayload` behålls. |
| **i18n** | Engelska modellnycklar; all copy via `hub-copy.ts` (SV/EN). |

**Stakeholder:** granska tabellen och avsnitt 3–4; efter godkännande kan Fas 1 påbörjas enligt [unified-shell-grid-fas1.md](unified-shell-grid-fas1.md).
