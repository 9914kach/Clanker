import { useCallback, useEffect, useRef } from "react";
import type { HubSessionState } from "@/hooks/use-hub-layout";
import type { HubPrefs } from "@/lib/hub-prefs";
import {
  buildHubSettingsPayloadFromStorage,
  fetchHubSettingsGet,
  fetchHubSettingsPut,
  HUB_SETTINGS_LOCAL_DIRTY_EVENT,
  reconcileHubSettingsAfterFetch,
  writeSyncMeta,
} from "@/lib/hub-settings-sync";

const PUSH_DEBOUNCE_MS = 900;

export function useHubSettingsSync(me: HubSessionState, prefs: HubPrefs): void {
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPush = useCallback(async () => {
    if (me.status !== "user") {
      return;
    }
    const payload = buildHubSettingsPayloadFromStorage(prefsRef.current);
    const res = await fetchHubSettingsPut(payload);
    if (res?.ok) {
      const t = Date.parse(res.updatedAt);
      writeSyncMeta({
        lastLocalWriteMs: Number.isFinite(t) ? t : Date.now(),
        lastServerUpdatedAt: res.updatedAt,
      });
    }
  }, [me.status]);

  const schedulePush = useCallback(() => {
    if (me.status !== "user") {
      return;
    }
    if (pushTimerRef.current !== null) {
      clearTimeout(pushTimerRef.current);
    }
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void flushPush();
    }, PUSH_DEBOUNCE_MS);
  }, [flushPush, me.status]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current !== null) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (me.status !== "user") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = await fetchHubSettingsGet();
      if (cancelled || !r) {
        return;
      }
      reconcileHubSettingsAfterFetch(r, () => {
        void flushPush();
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [flushPush, me.status, me.status === "user" ? me.profile.id : ""]);

  useEffect(() => {
    if (me.status !== "user") {
      return;
    }
    const onDirty = () => {
      schedulePush();
    };
    window.addEventListener(HUB_SETTINGS_LOCAL_DIRTY_EVENT, onDirty);
    return () => window.removeEventListener(HUB_SETTINGS_LOCAL_DIRTY_EVENT, onDirty);
  }, [me.status, schedulePush]);
}
