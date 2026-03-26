# Fas 1+2 — Unified Shell Grid: Implementation

**Status:** Implementerat (2026-03-26).  
**Beroende:** [unified-shell-grid-fas0.md](unified-shell-grid-fas0.md) (godkänd terminologi och policy).

---

## Vad som infördes

### Fas 1 — Intern datamodell och adapter

**Ny fil:** `apps/discord-hub-web/src/lib/hub-grid-node.ts`

- Definierar `HubGridNode` — intern representation av ett element på ytan:
  - `id` (stabil sträng), `kind` (`"widget" | "unknown"`), `geometry` (x/y/w/h/z eller `null`), `hidden`, `containerId` (null = root), `metadata` (fri `Record<string, unknown>`)
- Definierar `HubGridGeometry`, `HubGridNodeMap`
- **Adapter:** `desktopLayoutToNodes()` — legacy `Record<widgetId, HubDesktopWidgetLayout>` → `HubGridNodeMap`
- **Adapter:** `nodesToDesktopLayout()` — `HubGridNodeMap` → legacy form (för roundtrip och kompatibilitet)
- **Normalisering:** `normalizeNodeMap()` — fail-soft mot ett defaults-record; okända noder bevaras; ej låst mot fasta widget-ID:n
- **Hjälpare:** `geometriesFromDesktopLayout()` — bygger geometry-defaults från legacy layout

**Ändrad fil:** `apps/discord-hub-web/src/lib/hub-dashboard-layout-storage.ts`

- `normalizeDesktopLayoutRecord()` är uppgraderad:
  - Kände tidigare bara igen kända widget-ID:n (hårdkodade mot `DEFAULT_WIDGET_LAYOUTS`)
  - Bevarar nu **fail-soft extra/okända ID:n** i input-data om de har giltig geometri
  - Bakåtkompatibel: befintliga användares data läses korrekt; standardwidgets fylls med defaults

### Fas 2 — Unified Surface Engine

**Ny fil:** `apps/discord-hub-web/src/hooks/use-hub-surface-engine.ts`

- Hook `useHubSurfaceEngine({ layoutEditMode, gridSnapEnabled, prefs })` kapslar all layoutlogik:
  - Edit-session (draft/baseline/undo/redo/autosave)
  - Widget-selektion (multi-select, nudge, bring-to-front)
  - Move, resize, focus, reveal, hide, resetPosition, resetLayout
  - Synk mot localStorage och remote-settings via `HUB_SETTINGS_REMOTE_APPLY_EVENT`
  - Korrekt persistens av layout och autosave-flagga
- `onSaveCommitted` / `onDiscardDraft` callbacks för UI-notifikationer (toasts, ljud)

**Ändrad fil:** `apps/discord-hub-web/src/pages/Dashboard.tsx`

- All inline layout-state och layout-callbacks är borttagna (~380 rader)
- Ersatt av `useHubSurfaceEngine` + tunna wrapper-callbacks för toast/ljud
- Gränssnitt mot `HubDesktopSurface` och `HubDesktopShellState` är oförändrat
- Inga visuella ändringar

---

## Kompatibilitetsstrategi

| Område | Strategi |
|--------|----------|
| `version: 1` payload | Behålls oförändrat; ny modell är intern |
| `desktopLayout` i localStorage | Läses/skrivs som tidigare; normalisering är utökad men bakåtkompatibel |
| Extra widget-ID:n i localStorage | Bevaras nu fail-soft (tidigare kasserades de) |
| Remote settings (PUT/GET) | Oförändrat API; `hub-settings-sync.ts` rör ej |
| `HubDesktopShellState` interface | Oförändrat; Dashboard binder fortfarande alla fält |
| `HubDesktopSurface` props | Oförändrade |

---

## Hur route-paneler kan nyttja ytan (Fas 3)

`useHubSurfaceEngine` är nu fristående från Dashboard.tsx. En route-panel instansierar hooken med:

```typescript
const surface = useHubSurfaceEngine({
  layoutEditMode,
  gridSnapEnabled,
  prefs,
});
```

Initialt kan den rendera befintligt innehåll (via `<Outlet>`); i Fas 3 kan den byta till att rendera `HubDesktopSurface` med sin egen widget-lista och layout — **utan att introducera duplicerad layoutlogik**.

---

## Kända begränsningar inför Fas 3

- `containerId` finns i `HubGridNode` men root-container är implicit (ingen explicit container-hierarki ännu).
- `kind: "unknown"` bevaras i roundtrip men har inga capabilities — Fas 3 specificerar schema per kind.
- Shell-ordnade listor (nav, dock-pins, bokmärken) ingår inte i `HubGridNode` ännu — de synkas fortfarande via separata localStorage-nycklar.
- `layoutEditMode` är fortfarande ett single-toggle (kombinerat Desktop Edit + Shell Edit) — se Fas 3 ADR om enum-läge.
- `metadata` i `HubGridNode` är en fri `Record<string, unknown>` — Fas 3 specificerar schema per kind.

---

## Ändrade filer (summering)

| Fil | Förändring |
|-----|------------|
| `src/lib/hub-grid-node.ts` | **Ny** — HubGridNode-modell + adapter + normalisering |
| `src/lib/hub-dashboard-layout-storage.ts` | Uppgraderad `normalizeDesktopLayoutRecord` (fail-soft för okända ID:n) |
| `src/hooks/use-hub-surface-engine.ts` | **Ny** — gemensam ytmotor-hook |
| `src/pages/Dashboard.tsx` | Refaktorerad till att använda `useHubSurfaceEngine` |
| `docs/homelab-todo.md` | Fas 1+2 markerade klara |
