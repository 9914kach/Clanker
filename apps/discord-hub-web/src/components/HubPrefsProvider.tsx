import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cloneHubPrefs,
  DEFAULT_WIDGET_VISUAL_PREFS,
  loadHubPrefsFromStorage,
  mergeHubPrefs,
  saveHubPrefsToStorage,
  type HubPrefs,
  type HubWidgetVisualPrefs,
} from "@/lib/hub-prefs";
import {
  bumpLocalSettingsRevision,
  HUB_SETTINGS_REMOTE_APPLY_EVENT,
  type HubRemoteApplyDetail,
} from "@/lib/hub-settings-sync";

type HubPrefsContextValue = {
  prefs: HubPrefs;
  setPrefs: (next: HubPrefs | ((prev: HubPrefs) => HubPrefs)) => void;
  patchPrefs: (patch: Partial<HubPrefs>) => void;
  updateWidgetVisualPrefs: (widgetId: string, patch: Partial<HubWidgetVisualPrefs>) => void;
};

const HubPrefsContext = createContext<HubPrefsContextValue | null>(null);

export function HubPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<HubPrefs>(() => loadHubPrefsFromStorage());
  const prefsSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    const onRemote = (event: Event) => {
      const detail = (event as CustomEvent<HubRemoteApplyDetail>).detail;
      if (!detail?.prefs) {
        return;
      }
      prefsSerializedRef.current = JSON.stringify(detail.prefs);
      setPrefsState(cloneHubPrefs(detail.prefs));
    };
    window.addEventListener(HUB_SETTINGS_REMOTE_APPLY_EVENT, onRemote);
    return () => window.removeEventListener(HUB_SETTINGS_REMOTE_APPLY_EVENT, onRemote);
  }, []);

  useEffect(() => {
    saveHubPrefsToStorage(prefs);
    const serialized = JSON.stringify(prefs);
    if (prefsSerializedRef.current === null) {
      prefsSerializedRef.current = serialized;
      return;
    }
    if (prefsSerializedRef.current === serialized) {
      return;
    }
    prefsSerializedRef.current = serialized;
    bumpLocalSettingsRevision();
  }, [prefs]);

  const setPrefs = useCallback((next: HubPrefs | ((prev: HubPrefs) => HubPrefs)) => {
    setPrefsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      return cloneHubPrefs(resolved);
    });
  }, []);

  const patchPrefs = useCallback((patch: Partial<HubPrefs>) => {
    setPrefsState((prev) => {
      const merged = mergeHubPrefs(prev, patch);
      return cloneHubPrefs(merged);
    });
  }, []);

  const updateWidgetVisualPrefs = useCallback((widgetId: string, patch: Partial<HubWidgetVisualPrefs>) => {
    setPrefsState((prev) => {
      const cur = prev.widgetVisualById[widgetId] ?? {};
      const nextW: HubWidgetVisualPrefs = {
        ...DEFAULT_WIDGET_VISUAL_PREFS,
        ...cur,
        ...patch,
      };
      return cloneHubPrefs({
        ...prev,
        widgetVisualById: {
          ...prev.widgetVisualById,
          [widgetId]: nextW,
        },
      });
    });
  }, []);

  const value = useMemo<HubPrefsContextValue>(
    () => ({ prefs, setPrefs, patchPrefs, updateWidgetVisualPrefs }),
    [patchPrefs, prefs, setPrefs, updateWidgetVisualPrefs],
  );

  return <HubPrefsContext.Provider value={value}>{children}</HubPrefsContext.Provider>;
}

export function useHubPrefs(): HubPrefsContextValue {
  const ctx = useContext(HubPrefsContext);
  if (!ctx) {
    throw new Error("useHubPrefs must be used within HubPrefsProvider");
  }
  return ctx;
}

/** For optional consumers (e.g. tests) without throwing. */
export function useHubPrefsOptional(): HubPrefsContextValue | null {
  return useContext(HubPrefsContext);
}
