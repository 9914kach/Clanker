import { normalizeNavBookmarkIconKey, type HubNavBookmarkIconKey } from "@/lib/hub-nav-bookmark-icons";
import { isExternalNavPath } from "@/lib/hub-nav-bookmarks";
import { DEFAULT_PRIMARY_NAV_ORDER, type HubPrimaryNavItemId } from "@/lib/hub-shell-layout-order";

export const HUB_PRIMARY_NAV_OVERRIDES_KEY = "hub.shell.primaryNavOverrides.v1";

export type HubPrimaryNavOverride = {
  label: string;
  path: string;
  iconKey: HubNavBookmarkIconKey;
};

const ALLOWED_IDS = new Set<HubPrimaryNavItemId>(DEFAULT_PRIMARY_NAV_ORDER);

export function normalizeInternalPath(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  if (isExternalNavPath(t)) {
    return null;
  }
  return t.startsWith("/") ? t : `/${t}`;
}

export function loadPrimaryNavOverrides(): Partial<Record<HubPrimaryNavItemId, HubPrimaryNavOverride>> {
  try {
    const raw = localStorage.getItem(HUB_PRIMARY_NAV_OVERRIDES_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Partial<Record<HubPrimaryNavItemId, HubPrimaryNavOverride>> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!ALLOWED_IDS.has(key as HubPrimaryNavItemId)) {
        continue;
      }
      if (!value || typeof value !== "object") {
        continue;
      }
      const rec = value as { label?: unknown; path?: unknown; iconKey?: unknown };
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      const path = typeof rec.path === "string" ? normalizeInternalPath(rec.path) : null;
      if (!label || !path) {
        continue;
      }
      const iconKey = normalizeNavBookmarkIconKey(rec.iconKey);
      out[key as HubPrimaryNavItemId] = { label, path, iconKey };
    }
    return out;
  } catch {
    return {};
  }
}

export function savePrimaryNavOverrides(
  overrides: Partial<Record<HubPrimaryNavItemId, HubPrimaryNavOverride>>,
): void {
  try {
    localStorage.setItem(HUB_PRIMARY_NAV_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}
