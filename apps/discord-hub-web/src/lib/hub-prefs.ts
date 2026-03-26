import {
  HUB_DESKTOP_LAYOUT_GRID,
  type HubSnapStrength,
} from "@/lib/hub-desktop-layout";

export const HUB_PREFS_STORAGE_KEY = "hub.prefs.v1";

export type HubWidgetSizePreset = "compact" | "cozy" | "expanded";
export type HubToneOverride = "inherit" | "useful" | "social" | "chaos";
export type HubGridDensity = "compact" | "cozy" | "expanded";
export type HubDesktopStylePackId = "default" | "midnight" | "paper" | "signal";
export type HubDockPosition = "bottom" | "left";
export type HubDockScale = "sm" | "md" | "lg";
export type HubCopyPersonality = "calm" | "normal" | "chaotic";
export type HubToastVerbosity = "minimal" | "normal" | "verbose";
export type HubMemeFrequency = "off" | "low" | "normal";
export type HubInspectCursorPreset = "crosshair" | "dot" | "ring" | "bracket";
export type HubInspectCursorColorSource = "primary" | "accent" | "foreground" | "custom";

export type { HubSnapStrength };

export type HubWidgetVisualPrefs = {
  sizePreset: HubWidgetSizePreset;
  toneOverride: HubToneOverride;
  /** Card fill: higher = more opaque (0–100). */
  glassOpacity: number;
  /** Backdrop blur tier 0–3. */
  blurStrength: 0 | 1 | 2 | 3;
  showSubtitle: boolean;
  showToneBadge: boolean;
};

export type HubDesktopPrefsSlice = {
  stylePackId: HubDesktopStylePackId;
  gridDensity: HubGridDensity;
  snapStrength: HubSnapStrength;
};

export type HubDockPrefsSlice = {
  position: HubDockPosition;
  scale: HubDockScale;
};

export type HubMotionPrefsSlice = {
  /** 0 = snappy / low motion flair, 100 = full transitions. */
  animationIntensity: number;
};

export type HubCopyStylePrefsSlice = {
  personality: HubCopyPersonality;
  toastVerbosity: HubToastVerbosity;
  memeFrequency: HubMemeFrequency;
};

/** Anpassad pekare i dev när skal-högerklick är aktivt (inte webbläsarens meny). */
export type HubInspectCursorPrefsSlice = {
  preset: HubInspectCursorPreset;
  colorSource: HubInspectCursorColorSource;
  /** Gäller när colorSource är custom; #RGB eller #RRGGBB. */
  customColor: string;
  /** 50–200, 100 = standard. */
  sizePercent: number;
};

export type HubPrefs = {
  widgetVisualById: Partial<Record<string, HubWidgetVisualPrefs>>;
  desktop: HubDesktopPrefsSlice;
  dock: HubDockPrefsSlice;
  motion: HubMotionPrefsSlice;
  copyStyle: HubCopyStylePrefsSlice;
  inspectCursor: HubInspectCursorPrefsSlice;
};

export const DEFAULT_WIDGET_VISUAL_PREFS: HubWidgetVisualPrefs = {
  sizePreset: "cozy",
  toneOverride: "inherit",
  glassOpacity: 85,
  blurStrength: 2,
  showSubtitle: true,
  showToneBadge: true,
};

export const DEFAULT_INSPECT_CURSOR_PREFS: HubInspectCursorPrefsSlice = {
  preset: "crosshair",
  colorSource: "primary",
  customColor: "#38bdf8",
  sizePercent: 100,
};

export const DEFAULT_HUB_PREFS: HubPrefs = {
  widgetVisualById: {},
  desktop: {
    stylePackId: "default",
    gridDensity: "cozy",
    snapStrength: "standard",
  },
  dock: {
    position: "bottom",
    scale: "md",
  },
  motion: {
    animationIntensity: 100,
  },
  copyStyle: {
    personality: "normal",
    toastVerbosity: "normal",
    memeFrequency: "off",
  },
  inspectCursor: { ...DEFAULT_INSPECT_CURSOR_PREFS },
};

function cloneWidgetPrefs(p: HubWidgetVisualPrefs): HubWidgetVisualPrefs {
  return { ...p };
}

export function cloneHubPrefs(prefs: HubPrefs): HubPrefs {
  const next: HubPrefs = {
    widgetVisualById: {},
    desktop: { ...prefs.desktop },
    dock: { ...prefs.dock },
    motion: { ...prefs.motion },
    copyStyle: { ...prefs.copyStyle },
    inspectCursor: { ...prefs.inspectCursor },
  };
  for (const [id, w] of Object.entries(prefs.widgetVisualById)) {
    if (w) {
      next.widgetVisualById[id] = cloneWidgetPrefs(w);
    }
  }
  return next;
}

export function gridStepForDensity(density: HubGridDensity): number {
  if (density === "compact") {
    return 8;
  }
  if (density === "expanded") {
    return 24;
  }
  return HUB_DESKTOP_LAYOUT_GRID;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

const HEX_6 = /^#[0-9A-Fa-f]{6}$/;
const HEX_3 = /^#[0-9A-Fa-f]{3}$/;

/** Normaliserar #RGB → #RRGGBB; returnerar null om ogiltig. */
export function normalizeHubInspectCursorHex(raw: string): string | null {
  const t = raw.trim();
  if (HEX_6.test(t)) {
    return t.toLowerCase();
  }
  if (HEX_3.test(t)) {
    const a = t.slice(1);
    return `#${a[0]}${a[0]}${a[1]}${a[1]}${a[2]}${a[2]}`.toLowerCase();
  }
  return null;
}

export function inspectCursorCssColor(prefs: HubInspectCursorPrefsSlice): string {
  if (prefs.colorSource === "accent") {
    return "var(--accent)";
  }
  if (prefs.colorSource === "foreground") {
    return "var(--foreground)";
  }
  if (prefs.colorSource === "custom") {
    return normalizeHubInspectCursorHex(prefs.customColor) ?? DEFAULT_INSPECT_CURSOR_PREFS.customColor;
  }
  return "var(--primary)";
}

function parseWidgetVisualPrefs(raw: unknown): Partial<HubWidgetVisualPrefs> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const out: Partial<HubWidgetVisualPrefs> = {};
  if (raw.sizePreset === "compact" || raw.sizePreset === "cozy" || raw.sizePreset === "expanded") {
    out.sizePreset = raw.sizePreset;
  }
  if (
    raw.toneOverride === "inherit" ||
    raw.toneOverride === "useful" ||
    raw.toneOverride === "social" ||
    raw.toneOverride === "chaos"
  ) {
    out.toneOverride = raw.toneOverride;
  }
  if (typeof raw.glassOpacity === "number" && Number.isFinite(raw.glassOpacity)) {
    out.glassOpacity = clampInt(raw.glassOpacity, 0, 100);
  }
  if (raw.blurStrength === 0 || raw.blurStrength === 1 || raw.blurStrength === 2 || raw.blurStrength === 3) {
    out.blurStrength = raw.blurStrength;
  }
  if (typeof raw.showSubtitle === "boolean") {
    out.showSubtitle = raw.showSubtitle;
  }
  if (typeof raw.showToneBadge === "boolean") {
    out.showToneBadge = raw.showToneBadge;
  }
  return out;
}

export function mergeHubPrefs(base: HubPrefs, patch: unknown): HubPrefs {
  if (!isRecord(patch)) {
    return cloneHubPrefs(base);
  }
  const next = cloneHubPrefs(base);
  const wmap = patch.widgetVisualById;
  if (isRecord(wmap)) {
    for (const [id, wp] of Object.entries(wmap)) {
      const parsed = parseWidgetVisualPrefs(wp);
      if (!parsed || Object.keys(parsed).length === 0) {
        continue;
      }
      next.widgetVisualById[id] = {
        ...DEFAULT_WIDGET_VISUAL_PREFS,
        ...next.widgetVisualById[id],
        ...parsed,
      };
    }
  }
  const d = patch.desktop;
  if (isRecord(d)) {
    if (
      d.stylePackId === "default" ||
      d.stylePackId === "midnight" ||
      d.stylePackId === "paper" ||
      d.stylePackId === "signal"
    ) {
      next.desktop.stylePackId = d.stylePackId;
    }
    if (d.gridDensity === "compact" || d.gridDensity === "cozy" || d.gridDensity === "expanded") {
      next.desktop.gridDensity = d.gridDensity;
    }
    if (d.snapStrength === "relaxed" || d.snapStrength === "standard" || d.snapStrength === "firm") {
      next.desktop.snapStrength = d.snapStrength;
    }
  }
  const dock = patch.dock;
  if (isRecord(dock)) {
    if (dock.position === "bottom" || dock.position === "left") {
      next.dock.position = dock.position;
    }
    if (dock.scale === "sm" || dock.scale === "md" || dock.scale === "lg") {
      next.dock.scale = dock.scale;
    }
  }
  const motion = patch.motion;
  if (isRecord(motion) && typeof motion.animationIntensity === "number" && Number.isFinite(motion.animationIntensity)) {
    next.motion.animationIntensity = clampInt(motion.animationIntensity, 0, 100);
  }
  const cs = patch.copyStyle;
  if (isRecord(cs)) {
    if (cs.personality === "calm" || cs.personality === "normal" || cs.personality === "chaotic") {
      next.copyStyle.personality = cs.personality;
    }
    if (cs.toastVerbosity === "minimal" || cs.toastVerbosity === "normal" || cs.toastVerbosity === "verbose") {
      next.copyStyle.toastVerbosity = cs.toastVerbosity;
    }
    if (cs.memeFrequency === "off" || cs.memeFrequency === "low" || cs.memeFrequency === "normal") {
      next.copyStyle.memeFrequency = cs.memeFrequency;
    }
  }
  const ic = patch.inspectCursor;
  if (isRecord(ic)) {
    if (ic.preset === "crosshair" || ic.preset === "dot" || ic.preset === "ring" || ic.preset === "bracket") {
      next.inspectCursor.preset = ic.preset;
    }
    if (
      ic.colorSource === "primary" ||
      ic.colorSource === "accent" ||
      ic.colorSource === "foreground" ||
      ic.colorSource === "custom"
    ) {
      next.inspectCursor.colorSource = ic.colorSource;
    }
    if (typeof ic.customColor === "string") {
      const norm = normalizeHubInspectCursorHex(ic.customColor);
      if (norm) {
        next.inspectCursor.customColor = norm;
      }
    }
    if (typeof ic.sizePercent === "number" && Number.isFinite(ic.sizePercent)) {
      next.inspectCursor.sizePercent = clampInt(ic.sizePercent, 50, 200);
    }
  }
  return next;
}

export function loadHubPrefsFromStorage(): HubPrefs {
  try {
    const raw = localStorage.getItem(HUB_PREFS_STORAGE_KEY);
    if (!raw) {
      return cloneHubPrefs(DEFAULT_HUB_PREFS);
    }
    const parsed: unknown = JSON.parse(raw);
    return mergeHubPrefs(DEFAULT_HUB_PREFS, parsed);
  } catch {
    return cloneHubPrefs(DEFAULT_HUB_PREFS);
  }
}

export function saveHubPrefsToStorage(prefs: HubPrefs): void {
  try {
    localStorage.setItem(HUB_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function getWidgetVisualPrefs(
  prefs: HubPrefs,
  widgetId: string,
): HubWidgetVisualPrefs {
  const partial = prefs.widgetVisualById[widgetId];
  return {
    ...DEFAULT_WIDGET_VISUAL_PREFS,
    ...partial,
  };
}

export function effectiveWidgetTone(
  baseTone: "useful" | "social" | "chaos",
  override: HubToneOverride,
): "useful" | "social" | "chaos" {
  if (override === "inherit") {
    return baseTone;
  }
  return override;
}
