import { HUB_DESKTOP_LAYOUT_GRID, type HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";
import { clampWidgetDimensions } from "@/lib/hub-widget-size-bounds";

export const DASHBOARD_LAYOUT_KEY = "hub.dashboard.layout.v4";
const LEGACY_DASHBOARD_LAYOUT_KEY = "hub.dashboard.layout.v3";
const LEGACY_DASHBOARD_LAYOUT_KEY_V2 = "hub.dashboard.layout.v2";
export const LAYOUT_AUTOSAVE_KEY = "hub.dashboard.layout.autosave.v1";
const WIDGET_ORDER_KEY = "hub.dashboard.widget-order.v1";
const HIDDEN_WIDGETS_KEY = "hub.dashboard.hidden-widgets.v1";

const DEFAULT_WIDGET_ORDER = [
  "welcome",
  "server-pulse",
  "lore-quote",
  "discord-wiretap",
  "mood-clock",
  "wheel-launchpad",
  "chaos-meter",
  "voice-orbit",
  "neutralen-radio",
  "music-player",
  "presence-radar",
  "ritual-console",
  "custom-modules",
] as const;

const DEFAULT_HIDDEN_WIDGETS = [
  "lore-quote",
  "discord-wiretap",
  "mood-clock",
  "wheel-launchpad",
  "chaos-meter",
  "voice-orbit",
  "neutralen-radio",
  "music-player",
  "presence-radar",
  "ritual-console",
  "custom-modules",
] as const;

export const DEFAULT_WIDGET_LAYOUTS: Record<string, HubDesktopWidgetLayout> = {
  welcome: { x: 0, y: 0, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 1, hidden: false },
  "server-pulse": { x: HUB_DESKTOP_LAYOUT_GRID, y: 0, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 2, hidden: false },
  "wheel-launchpad": { x: 2 * HUB_DESKTOP_LAYOUT_GRID, y: 0, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 3, hidden: true },
  "chaos-meter": { x: 0, y: HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 4, hidden: true },
  "voice-orbit": { x: HUB_DESKTOP_LAYOUT_GRID, y: HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 5, hidden: true },
  "neutralen-radio": { x: 2 * HUB_DESKTOP_LAYOUT_GRID, y: HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 6, hidden: true },
  "music-player": { x: 0, y: 2 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 7, hidden: true },
  "mood-clock": { x: HUB_DESKTOP_LAYOUT_GRID, y: 2 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 8, hidden: true },
  "lore-quote": { x: 2 * HUB_DESKTOP_LAYOUT_GRID, y: 2 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 9, hidden: true },
  "discord-wiretap": { x: 0, y: 3 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 10, hidden: true },
  "presence-radar": { x: HUB_DESKTOP_LAYOUT_GRID, y: 3 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 11, hidden: true },
  "ritual-console": { x: 2 * HUB_DESKTOP_LAYOUT_GRID, y: 3 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 12, hidden: true },
  "custom-modules": { x: 0, y: 4 * HUB_DESKTOP_LAYOUT_GRID, w: HUB_DESKTOP_LAYOUT_GRID, h: HUB_DESKTOP_LAYOUT_GRID, z: 13, hidden: true },
};

type HubDashboardLayoutV4 = {
  version: 4;
  widgets: Record<string, HubDesktopWidgetLayout>;
};

function clampPx(n: unknown, fallback: number, min = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.round(n));
}

function normalizePossiblyOverscaledValueSet(value: Partial<HubDesktopWidgetLayout>): Partial<HubDesktopWidgetLayout> {
  const x = typeof value.x === "number" && Number.isFinite(value.x) ? value.x : undefined;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? value.y : undefined;
  const w = typeof value.w === "number" && Number.isFinite(value.w) ? value.w : undefined;
  const h = typeof value.h === "number" && Number.isFinite(value.h) ? value.h : undefined;
  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return value;
  }
  const suspiciouslyLarge =
    w >= HUB_DESKTOP_LAYOUT_GRID * 20 ||
    h >= HUB_DESKTOP_LAYOUT_GRID * 20 ||
    x >= HUB_DESKTOP_LAYOUT_GRID * 80 ||
    y >= HUB_DESKTOP_LAYOUT_GRID * 80;
  const alignedToGrid =
    x % HUB_DESKTOP_LAYOUT_GRID === 0 &&
    y % HUB_DESKTOP_LAYOUT_GRID === 0 &&
    w % HUB_DESKTOP_LAYOUT_GRID === 0 &&
    h % HUB_DESKTOP_LAYOUT_GRID === 0;
  if (!suspiciouslyLarge || !alignedToGrid) {
    return value;
  }
  return {
    ...value,
    x: Math.round(x / HUB_DESKTOP_LAYOUT_GRID),
    y: Math.round(y / HUB_DESKTOP_LAYOUT_GRID),
    w: Math.round(w / HUB_DESKTOP_LAYOUT_GRID),
    h: Math.round(h / HUB_DESKTOP_LAYOUT_GRID),
  };
}

function unitToPx(value: number): number {
  return Math.max(0, Math.round(value * HUB_DESKTOP_LAYOUT_GRID));
}

function migrateUnitLayoutToPx(layout: unknown): Record<string, HubDesktopWidgetLayout> {
  if (!layout || typeof layout !== "object") {
    return normalizeDesktopLayoutRecord(null);
  }
  const next: Record<string, HubDesktopWidgetLayout> = {};
  for (const [id, entry] of Object.entries(layout as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const value = entry as Partial<HubDesktopWidgetLayout>;
    const rawX = typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0;
    const rawY = typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0;
    const rawW = typeof value.w === "number" && Number.isFinite(value.w) ? value.w : 120;
    const rawH = typeof value.h === "number" && Number.isFinite(value.h) ? value.h : 100;
    // Legacy unit-based layouts had tiny w/h (e.g. 2x2). Keep already pixel-based legacy values untouched.
    const looksLikeUnitLayout = rawW <= 24 && rawH <= 24;
    next[id] = {
      x: looksLikeUnitLayout ? unitToPx(rawX) : Math.round(rawX),
      y: looksLikeUnitLayout ? unitToPx(rawY) : Math.round(rawY),
      w: Math.max(120, looksLikeUnitLayout ? unitToPx(rawW) : Math.round(rawW)),
      h: Math.max(100, looksLikeUnitLayout ? unitToPx(rawH) : Math.round(rawH)),
      z: typeof value.z === "number" && Number.isFinite(value.z) ? value.z : 1,
      hidden: typeof value.hidden === "boolean" ? value.hidden : false,
    };
  }
  return normalizeDesktopLayoutRecord(next);
}

function safeReadList(key: string, fallback: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [...fallback];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...fallback];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [...fallback];
  }
}

/**
 * Normaliserar ett parsat layout-objekt till ett välformat `HubDesktopWidgetLayout`-record.
 *
 * Strategi:
 * - Kända widget-ID:n (i DEFAULT_WIDGET_LAYOUTS) valideras och fylls med defaults vid saknade fält.
 * - Extra/okända ID:n som förekommer i indata bevaras fail-soft (för framtida kompatibilitet),
 *   förutsatt att de har en tolkbar geometri.
 * - `null`/ogiltigt indata: migrerar från legacy localStorage-nycklar.
 */
export function normalizeDesktopLayoutRecord(
  parsed: unknown,
): Record<string, HubDesktopWidgetLayout> {
  if (parsed && typeof parsed === "object") {
    const input = parsed as Record<string, unknown>;
    const result: Record<string, HubDesktopWidgetLayout> = {};

    // Normalisera kända widget-ID:n mot defaults
    for (const [id, defaults] of Object.entries(DEFAULT_WIDGET_LAYOUTS)) {
      const candidate = input[id];
      if (!candidate || typeof candidate !== "object") {
        result[id] = { ...defaults };
        continue;
      }
      const value = normalizePossiblyOverscaledValueSet(candidate as Partial<HubDesktopWidgetLayout>);
      const wRaw = clampPx(value.w, defaults.w, 120);
      const hRaw = clampPx(value.h, defaults.h, 100);
      const { w, h } = clampWidgetDimensions(id, wRaw, hRaw);
      result[id] = {
        x: clampPx(value.x, defaults.x, 0),
        y: clampPx(value.y, defaults.y, 0),
        w,
        h,
        z: Number.isFinite(value.z) ? Number(value.z) : defaults.z,
        hidden: typeof value.hidden === "boolean" ? value.hidden : defaults.hidden,
      };
    }

    // Bevara fail-soft okända ID:n (framtida kompatibilitet)
    for (const [id, candidate] of Object.entries(input)) {
      if (id in result || !candidate || typeof candidate !== "object") {
        continue;
      }
      const value = normalizePossiblyOverscaledValueSet(candidate as Partial<HubDesktopWidgetLayout>);
      if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.w) && Number.isFinite(value.h)) {
        const wRaw = clampPx(value.w, 120, 120);
        const hRaw = clampPx(value.h, 100, 100);
        const { w, h } = clampWidgetDimensions(id, wRaw, hRaw);
        result[id] = {
          x: clampPx(value.x, 0, 0),
          y: clampPx(value.y, 0, 0),
          w,
          h,
          z: Number.isFinite(value.z) ? Number(value.z) : 1,
          hidden: typeof value.hidden === "boolean" ? value.hidden : false,
        };
      }
    }

    return result;
  }

  const migratedLayout = Object.fromEntries(
    Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([id, layout]) => [id, { ...layout }]),
  ) as Record<string, HubDesktopWidgetLayout>;
  const legacyOrder = safeReadList(WIDGET_ORDER_KEY, DEFAULT_WIDGET_ORDER);
  const legacyHidden = new Set(safeReadList(HIDDEN_WIDGETS_KEY, DEFAULT_HIDDEN_WIDGETS));

  legacyOrder.forEach((id, index) => {
    if (!migratedLayout[id]) {
      return;
    }
    migratedLayout[id] = {
      ...migratedLayout[id],
      z: index + 1,
      hidden: legacyHidden.has(id),
    };
  });

  return migratedLayout;
}

export function readDesktopLayoutFromStorage(): Record<string, HubDesktopWidgetLayout> {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const v4 = parseV4(parsed);
      if (v4) {
        return v4;
      }
      return normalizeDesktopLayoutRecord(parsed);
    }
    const legacyRaw = localStorage.getItem(LEGACY_DASHBOARD_LAYOUT_KEY);
    if (legacyRaw) {
      const parsed: unknown = JSON.parse(legacyRaw);
      return migrateUnitLayoutToPx(parsed);
    }
    const legacyV2Raw = localStorage.getItem(LEGACY_DASHBOARD_LAYOUT_KEY_V2);
    if (legacyV2Raw) {
      const parsed: unknown = JSON.parse(legacyV2Raw);
      return migrateUnitLayoutToPx(parsed);
    }
  } catch {
    /* ignore */
  }
  return normalizeDesktopLayoutRecord(null);
}

export function readLayoutAutosaveEnabledFromStorage(): boolean {
  try {
    return localStorage.getItem(LAYOUT_AUTOSAVE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeDesktopLayoutToStorage(layout: Record<string, HubDesktopWidgetLayout>): void {
  try {
    const v4: HubDashboardLayoutV4 = {
      version: 4,
      widgets: normalizeDesktopLayoutRecord(layout),
    };
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(v4));
  } catch {
    /* ignore */
  }
}

export function writeLayoutAutosaveEnabledToStorage(enabled: boolean): void {
  try {
    localStorage.setItem(LAYOUT_AUTOSAVE_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}
function parseV4(parsed: unknown): Record<string, HubDesktopWidgetLayout> | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const value = parsed as Partial<HubDashboardLayoutV4>;
  if (value.version !== 4 || !value.widgets || typeof value.widgets !== "object") {
    return null;
  }
  return normalizeDesktopLayoutRecord(value.widgets);
}
