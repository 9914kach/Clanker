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
