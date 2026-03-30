export type HubDesktopWidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  hidden: boolean;
};

export const HUB_DESKTOP_LAYOUT_GRID = 192;

/** Synligt avstånd mellan widget-kort (horisontellt/vertikalt mellan grannar). */
export const HUB_DESKTOP_WIDGET_GAP_PX = 16;

/**
 * GridStack `margin` är inset på item-innehåll per sida; gap mellan två kort = 2× detta.
 * Sätts till hälften av {@link HUB_DESKTOP_WIDGET_GAP_PX}.
 * Kortet blir alltså visuellt mindre än layoutens w×h-ruta; ytan i data = “fotavtryck”, inte kant-till-kant UI.
 */
export const HUB_GRIDSTACK_WIDGET_MARGIN_PX = HUB_DESKTOP_WIDGET_GAP_PX / 2;

export type HubSnapStrength = "relaxed" | "standard" | "firm";

export function effectiveSnapStep(baseGrid: number, snapStrength: HubSnapStrength): number {
  if (snapStrength === "relaxed") {
    return baseGrid * 2;
  }
  if (snapStrength === "firm") {
    return Math.max(64, Math.round(baseGrid / 2));
  }
  return baseGrid;
}

export function cloneLayoutRecord(
  layouts: Readonly<Record<string, HubDesktopWidgetLayout>>,
): Record<string, HubDesktopWidgetLayout> {
  const next: Record<string, HubDesktopWidgetLayout> = {};
  for (const [id, layout] of Object.entries(layouts)) {
    next[id] = { ...layout };
  }
  return next;
}

export function layoutRecordsEqual(
  a: Readonly<Record<string, HubDesktopWidgetLayout>>,
  b: Readonly<Record<string, HubDesktopWidgetLayout>>,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) {
      return false;
    }
  }
  for (const id of keysA) {
    const la = a[id];
    const lb = b[id];
    if (!la || !lb) {
      return false;
    }
    if (
      la.x !== lb.x ||
      la.y !== lb.y ||
      la.w !== lb.w ||
      la.h !== lb.h ||
      la.z !== lb.z ||
      la.hidden !== lb.hidden
    ) {
      return false;
    }
  }
  return true;
}

export function snapCoord(
  value: number,
  gridSnapEnabled: boolean,
  grid = HUB_DESKTOP_LAYOUT_GRID,
  snapStrength: HubSnapStrength = "standard",
): number {
  if (!gridSnapEnabled) {
    return value;
  }
  const step = effectiveSnapStep(grid, snapStrength);
  return Math.round(value / step) * step;
}
