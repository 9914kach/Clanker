export const HUB_PRIMARY_NAV_ORDER_KEY = "hub.shell.primaryNavOrder.v2";
export const DEFAULT_PRIMARY_NAV_ORDER = ["desktop", "wheel", "profile", "settings"] as const;
export type HubPrimaryNavItemId = (typeof DEFAULT_PRIMARY_NAV_ORDER)[number];

export function mergeOrderWithDefaults(saved: string[], defaults: readonly string[]): string[] {
  const allowed = new Set(defaults);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of saved) {
    if (allowed.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of defaults) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

export function loadMergedOrder(key: string, defaults: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [...defaults];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...defaults];
    }
    const ids = parsed.filter((x): x is string => typeof x === "string");
    return mergeOrderWithDefaults(ids, defaults);
  } catch {
    return [...defaults];
  }
}

export function saveOrder(key: string, order: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}
