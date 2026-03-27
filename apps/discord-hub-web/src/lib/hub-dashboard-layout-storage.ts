import type { HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";

export const DASHBOARD_LAYOUT_KEY = "hub.dashboard.layout.v2";
export const LAYOUT_AUTOSAVE_KEY = "hub.dashboard.layout.autosave.v1";
const WIDGET_ORDER_KEY = "hub.dashboard.widget-order.v1";
const HIDDEN_WIDGETS_KEY = "hub.dashboard.hidden-widgets.v1";

const DEFAULT_WIDGET_ORDER = [
  "welcome",
  "server-pulse",
  "wheel-launchpad",
  "presence-radar",
  "ritual-console",
  "custom-modules",
] as const;

const DEFAULT_HIDDEN_WIDGETS = ["ritual-console"] as const;

export const DEFAULT_WIDGET_LAYOUTS: Record<string, HubDesktopWidgetLayout> = {
  welcome: { x: 24, y: 70, w: 360, h: 220, z: 1, hidden: false },
  "server-pulse": { x: 412, y: 70, w: 360, h: 250, z: 2, hidden: false },
  "wheel-launchpad": { x: 800, y: 70, w: 336, h: 220, z: 3, hidden: false },
  "presence-radar": { x: 92, y: 324, w: 360, h: 210, z: 4, hidden: false },
  "ritual-console": { x: 484, y: 350, w: 392, h: 200, z: 5, hidden: true },
  "custom-modules": { x: 900, y: 330, w: 360, h: 290, z: 6, hidden: false },
};

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
      const value = candidate as Partial<HubDesktopWidgetLayout>;
      result[id] = {
        x: Number.isFinite(value.x) ? Number(value.x) : defaults.x,
        y: Number.isFinite(value.y) ? Number(value.y) : defaults.y,
        w: Number.isFinite(value.w) ? Number(value.w) : defaults.w,
        h: Number.isFinite(value.h) ? Number(value.h) : defaults.h,
        z: Number.isFinite(value.z) ? Number(value.z) : defaults.z,
        hidden: typeof value.hidden === "boolean" ? value.hidden : defaults.hidden,
      };
    }

    // Bevara fail-soft okända ID:n (framtida kompatibilitet)
    for (const [id, candidate] of Object.entries(input)) {
      if (id in result || !candidate || typeof candidate !== "object") {
        continue;
      }
      const value = candidate as Partial<HubDesktopWidgetLayout>;
      if (
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.w) &&
        Number.isFinite(value.h) &&
        Number.isFinite(value.z)
      ) {
        result[id] = {
          x: Number(value.x),
          y: Number(value.y),
          w: Number(value.w),
          h: Number(value.h),
          z: Number(value.z),
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
      return normalizeDesktopLayoutRecord(parsed);
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
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
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
