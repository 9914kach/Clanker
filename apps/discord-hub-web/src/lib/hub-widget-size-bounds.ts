import { HUB_DESKTOP_LAYOUT_GRID } from "@/lib/hub-desktop-layout";

const G = HUB_DESKTOP_LAYOUT_GRID;

export type HubWidgetSizeBounds = {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
};

/** Fallback for unknown widget ids (layout fail-soft, future widgets). */
export const HUB_WIDGET_SIZE_BOUNDS_DEFAULT: HubWidgetSizeBounds = {
  minW: 120,
  minH: 100,
  maxW: 960,
  maxH: 720,
};

/**
 * Per-dashboard-widget resize limits (px). Values align with HUB_DESKTOP_LAYOUT_GRID (192).
 */
export const HUB_WIDGET_SIZE_BOUNDS_BY_ID: Record<string, HubWidgetSizeBounds> = {
  welcome: { minW: G, minH: G, maxW: 3 * G, maxH: Math.round(2.67 * G) }, // 192–576 × 192–512
  "server-pulse": { minW: G, minH: G, maxW: 4 * G, maxH: 3 * G },
  "wheel-launchpad": { minW: Math.round(1.33 * G), minH: Math.round(1.25 * G), maxW: Math.round(3.33 * G), maxH: Math.round(3.33 * G) },
  "chaos-meter": { minW: G, minH: G, maxW: Math.round(2.17 * G), maxH: Math.round(2.71 * G) },
  "voice-orbit": { minW: G, minH: G, maxW: Math.round(3.33 * G), maxH: Math.round(3.33 * G) },
  "neutralen-radio": { minW: G, minH: Math.round(0.83 * G), maxW: Math.round(2.67 * G), maxH: 2 * G },
  "music-player": { minW: Math.round(1.33 * G), minH: Math.round(0.92 * G), maxW: Math.round(3.75 * G), maxH: Math.round(2.19 * G) },
  "mood-clock": { minW: G, minH: G, maxW: Math.round(2.08 * G), maxH: Math.round(2.5 * G) },
  "lore-quote": { minW: G, minH: Math.round(0.75 * G), maxW: Math.round(3.33 * G), maxH: Math.round(2.5 * G) },
  "discord-wiretap": { minW: Math.round(1.25 * G), minH: Math.round(1.04 * G), maxW: Math.round(4.17 * G), maxH: Math.round(3.33 * G) },
  "presence-radar": { minW: G, minH: G, maxW: Math.round(3.33 * G), maxH: Math.round(3.33 * G) },
  "ritual-console": { minW: Math.round(1.33 * G), minH: Math.round(1.04 * G), maxW: Math.round(3.75 * G), maxH: Math.round(2.92 * G) },
  "custom-modules": { minW: G, minH: G, maxW: 5 * G, maxH: Math.round(3.75 * G) },
};

export function getHubWidgetSizeBounds(widgetId: string): HubWidgetSizeBounds {
  return HUB_WIDGET_SIZE_BOUNDS_BY_ID[widgetId] ?? HUB_WIDGET_SIZE_BOUNDS_DEFAULT;
}

export function clampWidgetDimensions(
  widgetId: string,
  w: number,
  h: number,
): { w: number; h: number } {
  const b = getHubWidgetSizeBounds(widgetId);
  return {
    w: Math.min(b.maxW, Math.max(b.minW, Math.round(w))),
    h: Math.min(b.maxH, Math.max(b.minH, Math.round(h))),
  };
}
