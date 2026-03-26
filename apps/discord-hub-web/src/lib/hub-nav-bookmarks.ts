import { normalizeNavBookmarkIconKey, type HubNavBookmarkIconKey } from "@/lib/hub-nav-bookmark-icons";
import { DEFAULT_PRIMARY_NAV_ORDER, HUB_PRIMARY_NAV_ORDER_KEY } from "@/lib/hub-shell-layout-order";

export const HUB_NAV_BOOKMARKS_KEY = "hub.shell.navBookmarks.v1";

export type HubNavBookmark = {
  label: string;
  path: string;
  iconKey: HubNavBookmarkIconKey;
};

export type { HubNavBookmarkIconKey } from "@/lib/hub-nav-bookmark-icons";

const SYSTEM_NAV_IDS = new Set<string>(DEFAULT_PRIMARY_NAV_ORDER);

export function isSystemNavId(id: string): boolean {
  return SYSTEM_NAV_IDS.has(id);
}

export function isBookmarkNavId(id: string): boolean {
  return id.startsWith("bookmark-");
}

export function isExternalNavPath(path: string): boolean {
  const t = path.trim();
  return (
    /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("mailto:") || t.startsWith("tel:")
  );
}

export function createBookmarkNavId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `bookmark-${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `bookmark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadNavBookmarks(): Record<string, HubNavBookmark> {
  try {
    const raw = localStorage.getItem(HUB_NAV_BOOKMARKS_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, HubNavBookmark> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k !== "string" || !isBookmarkNavId(k)) {
        continue;
      }
      if (!v || typeof v !== "object") {
        continue;
      }
      const rec = v as { label?: unknown; path?: unknown; iconKey?: unknown };
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      const path = typeof rec.path === "string" ? rec.path.trim() : "";
      if (!label || !path) {
        continue;
      }
      const iconKey = normalizeNavBookmarkIconKey(rec.iconKey);
      out[k] = { label, path, iconKey };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveNavBookmarks(bookmarks: Record<string, HubNavBookmark>): void {
  try {
    localStorage.setItem(HUB_NAV_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch {
    /* ignore */
  }
}

/**
 * Behåller sparad ordning, rensar okända id:n, lägger till saknade system- och bokmärkes-id:n.
 */
export function mergePrimaryNavOrder(
  saved: string[],
  bookmarks: Record<string, HubNavBookmark>,
): string[] {
  const system = [...DEFAULT_PRIMARY_NAV_ORDER];
  const bookmarkIds = Object.keys(bookmarks);
  const allowed = new Set<string>([...system, ...bookmarkIds]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of saved) {
    if (allowed.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of system) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of bookmarkIds) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

export function loadPrimaryNavOrder(bookmarks: Record<string, HubNavBookmark>): string[] {
  let saved: string[] = [];
  try {
    const raw = localStorage.getItem(HUB_PRIMARY_NAV_ORDER_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        saved = parsed.filter((x): x is string => typeof x === "string");
      }
    }
  } catch {
    /* ignore */
  }
  return mergePrimaryNavOrder(saved, bookmarks);
}
