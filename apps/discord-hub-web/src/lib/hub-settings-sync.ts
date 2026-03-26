import { apiUrl } from "@/config";
import {
  normalizeDesktopLayoutRecord,
  readDesktopLayoutFromStorage,
  readLayoutAutosaveEnabledFromStorage,
  writeDesktopLayoutToStorage,
  writeLayoutAutosaveEnabledToStorage,
} from "@/lib/hub-dashboard-layout-storage";
import { cloneLayoutRecord, type HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";
import {
  cloneHubPrefs,
  DEFAULT_HUB_PREFS,
  mergeHubPrefs,
  saveHubPrefsToStorage,
  type HubPrefs,
} from "@/lib/hub-prefs";

export const HUB_SETTINGS_SYNC_META_KEY = "hub.settings.sync_meta.v1";

export const HUB_SETTINGS_REMOTE_APPLY_EVENT = "hub-settings-remote-apply";
export const HUB_SETTINGS_LOCAL_DIRTY_EVENT = "hub-settings-local-dirty";

export const HUB_SETTINGS_PAYLOAD_VERSION = 1 as const;

export type HubSettingsPayload = {
  version: typeof HUB_SETTINGS_PAYLOAD_VERSION;
  prefs?: HubPrefs;
  desktopLayout?: Record<string, HubDesktopWidgetLayout>;
  layoutAutosaveEnabled?: boolean;
};

export type HubSettingsSyncMeta = {
  /** Last local user edit (ms since epoch); compared to server `updatedAt`. */
  lastLocalWriteMs: number;
  /** ISO string from API after last successful push or remote apply. */
  lastServerUpdatedAt: string | null;
};

export type HubRemoteApplyDetail = {
  prefs?: HubPrefs;
  desktopLayout?: Record<string, HubDesktopWidgetLayout>;
  layoutAutosaveEnabled?: boolean;
};

export type HubSettingsGetResponse = {
  available: boolean;
  settings: unknown;
  updatedAt: string | null;
};

export type HubSettingsPutResponse = {
  ok: boolean;
  updatedAt: string;
};

export function readSyncMeta(): HubSettingsSyncMeta {
  try {
    const raw = localStorage.getItem(HUB_SETTINGS_SYNC_META_KEY);
    if (!raw) {
      return { lastLocalWriteMs: 0, lastServerUpdatedAt: null };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { lastLocalWriteMs: 0, lastServerUpdatedAt: null };
    }
    const o = parsed as Record<string, unknown>;
    const lastLocalWriteMs =
      typeof o.lastLocalWriteMs === "number" && Number.isFinite(o.lastLocalWriteMs)
        ? o.lastLocalWriteMs
        : 0;
    const lastServerUpdatedAt =
      typeof o.lastServerUpdatedAt === "string" ? o.lastServerUpdatedAt : null;
    return { lastLocalWriteMs, lastServerUpdatedAt };
  } catch {
    return { lastLocalWriteMs: 0, lastServerUpdatedAt: null };
  }
}

export function writeSyncMeta(meta: HubSettingsSyncMeta): void {
  try {
    localStorage.setItem(HUB_SETTINGS_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function bumpLocalSettingsRevision(): void {
  const cur = readSyncMeta();
  writeSyncMeta({
    ...cur,
    lastLocalWriteMs: Date.now(),
  });
  try {
    window.dispatchEvent(new CustomEvent(HUB_SETTINGS_LOCAL_DIRTY_EVENT));
  } catch {
    /* ignore */
  }
}

function serverTimeMs(iso: string | null): number {
  if (!iso) {
    return 0;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function parseRemoteSettings(raw: unknown): HubSettingsPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== HUB_SETTINGS_PAYLOAD_VERSION) {
    return null;
  }
  const prefs =
    o.prefs !== undefined ? mergeHubPrefs(DEFAULT_HUB_PREFS, o.prefs) : undefined;
  const desktopLayout =
    o.desktopLayout !== undefined
      ? normalizeDesktopLayoutRecord(o.desktopLayout)
      : undefined;
  const layoutAutosave =
    typeof o.layoutAutosaveEnabled === "boolean" ? o.layoutAutosaveEnabled : undefined;
  return {
    version: HUB_SETTINGS_PAYLOAD_VERSION,
    ...(prefs !== undefined ? { prefs } : {}),
    ...(desktopLayout !== undefined ? { desktopLayout } : {}),
    ...(layoutAutosave !== undefined ? { layoutAutosaveEnabled: layoutAutosave } : {}),
  };
}

export function buildHubSettingsPayloadFromStorage(prefs: HubPrefs): HubSettingsPayload {
  return {
    version: HUB_SETTINGS_PAYLOAD_VERSION,
    prefs: cloneHubPrefs(prefs),
    desktopLayout: cloneLayoutRecord(readDesktopLayoutFromStorage()),
    layoutAutosaveEnabled: readLayoutAutosaveEnabledFromStorage(),
  };
}

export function applyHubSettingsPayloadToLocalStorage(payload: HubSettingsPayload): void {
  if (payload.prefs) {
    const merged = mergeHubPrefs(DEFAULT_HUB_PREFS, payload.prefs);
    saveHubPrefsToStorage(merged);
  }
  if (payload.desktopLayout) {
    writeDesktopLayoutToStorage(cloneLayoutRecord(payload.desktopLayout));
  }
  if (typeof payload.layoutAutosaveEnabled === "boolean") {
    writeLayoutAutosaveEnabledToStorage(payload.layoutAutosaveEnabled);
  }
}

export function dispatchHubSettingsRemoteApply(detail: HubRemoteApplyDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(HUB_SETTINGS_REMOTE_APPLY_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}

export async function fetchHubSettingsGet(): Promise<HubSettingsGetResponse | null> {
  const res = await fetch(apiUrl("/api/me/hub-settings"), { credentials: "include" });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as HubSettingsGetResponse;
}

export async function fetchHubSettingsPut(
  payload: HubSettingsPayload,
): Promise<HubSettingsPutResponse | null> {
  const res = await fetch(apiUrl("/api/me/hub-settings"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as HubSettingsPutResponse;
}

function syncMetaKeyPresent(): boolean {
  try {
    return localStorage.getItem(HUB_SETTINGS_SYNC_META_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * After GET: if server is newer, apply to storage + React via event.
 * If local is newer or server empty, caller should schedule PUT.
 */
export function reconcileHubSettingsAfterFetch(
  response: HubSettingsGetResponse,
  onPushLocal: () => void,
): void {
  if (!response.available) {
    return;
  }

  const metaWasPresent = syncMetaKeyPresent();

  if (!metaWasPresent) {
    if (response.settings !== null && response.updatedAt !== null) {
      const remotePayload = parseRemoteSettings(response.settings);
      if (remotePayload) {
        applyHubSettingsPayloadToLocalStorage(remotePayload);
        writeSyncMeta({
          lastLocalWriteMs: serverTimeMs(response.updatedAt),
          lastServerUpdatedAt: response.updatedAt,
        });
        dispatchHubSettingsRemoteApply({
          prefs: remotePayload.prefs,
          desktopLayout: remotePayload.desktopLayout,
          layoutAutosaveEnabled: remotePayload.layoutAutosaveEnabled,
        });
        return;
      }
      writeSyncMeta({ lastLocalWriteMs: 0, lastServerUpdatedAt: null });
      return;
    }
    if (hasAnyLocalHubData()) {
      onPushLocal();
    }
    writeSyncMeta({ lastLocalWriteMs: 0, lastServerUpdatedAt: null });
    return;
  }

  const meta = readSyncMeta();
  const serverMs = serverTimeMs(response.updatedAt);
  const localMs = meta.lastLocalWriteMs;

  if (response.settings === null || response.updatedAt === null) {
    if (localMs > 0 || hasAnyLocalHubData()) {
      onPushLocal();
    }
    return;
  }

  const remotePayload = parseRemoteSettings(response.settings);
  if (!remotePayload) {
    return;
  }

  if (serverMs >= localMs) {
    applyHubSettingsPayloadToLocalStorage(remotePayload);
    writeSyncMeta({
      lastLocalWriteMs: serverMs,
      lastServerUpdatedAt: response.updatedAt,
    });
    dispatchHubSettingsRemoteApply({
      prefs: remotePayload.prefs,
      desktopLayout: remotePayload.desktopLayout,
      layoutAutosaveEnabled: remotePayload.layoutAutosaveEnabled,
    });
    return;
  }

  onPushLocal();
}

function hasAnyLocalHubData(): boolean {
  try {
    if (localStorage.getItem("hub.prefs.v1")) {
      return true;
    }
    if (localStorage.getItem("hub.dashboard.layout.v2")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

