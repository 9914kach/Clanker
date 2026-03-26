/**
 * use-hub-surface-engine — Fas 2 gemensam ytmotor för Unified Shell Grid.
 *
 * Denna hook kapslar all layoutlogik för en spatial desktop-yta:
 * - Edit-session med draft/baseline/undo/redo/autosave
 * - Widget-selektion (multi-select, nudge, bring-to-front)
 * - Move, resize, focus, hide, reveal
 * - Synk mot localStorage och remote-settings via events
 *
 * Dashboard.tsx använder hooken direkt.
 * Route-paneler kan i Fas 3 instansiera hooken med en annan initialLayout
 * och annan persistens-callback för att nyttja samma ytmotor.
 *
 * Kompatibilitet:
 * - Returnerar identiska gränssnitt som Dashboard.tsx hade inline.
 * - Ingen förändring i HubDesktopSurface props eller HubDesktopShellState.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_WIDGET_LAYOUTS,
  readDesktopLayoutFromStorage,
  readLayoutAutosaveEnabledFromStorage,
  writeDesktopLayoutToStorage,
  writeLayoutAutosaveEnabledToStorage,
} from "@/lib/hub-dashboard-layout-storage";
import {
  bumpLocalSettingsRevision,
  HUB_SETTINGS_REMOTE_APPLY_EVENT,
  type HubRemoteApplyDetail,
} from "@/lib/hub-settings-sync";
import {
  cloneLayoutRecord,
  HUB_DESKTOP_LAYOUT_GRID,
  layoutRecordsEqual,
  snapCoord,
  type HubDesktopWidgetLayout,
} from "@/lib/hub-desktop-layout";
import { gridStepForDensity, type HubPrefs } from "@/lib/hub-prefs";

const MIN_WIDGET_W = 240;
const MIN_WIDGET_H = 140;

type DesktopEditSession = {
  draft: Record<string, HubDesktopWidgetLayout>;
  baseline: Record<string, HubDesktopWidgetLayout>;
  past: Record<string, HubDesktopWidgetLayout>[];
  future: Record<string, HubDesktopWidgetLayout>[];
};

function nextDesktopZ(layouts: Readonly<Record<string, HubDesktopWidgetLayout>>): number {
  return Math.max(0, ...Object.values(layouts).map((l) => l.z)) + 1;
}

export type HubSurfaceEngineResult = {
  /** Layout som bör renderas (draft under edit, saved annars). */
  activeLayout: Record<string, HubDesktopWidgetLayout>;
  savedLayout: Record<string, HubDesktopWidgetLayout>;
  editSession: DesktopEditSession | null;
  selectedWidgetIds: string[];
  autosaveLayoutEnabled: boolean;

  isLayoutDirty: boolean;
  canUndoLayout: boolean;
  canRedoLayout: boolean;

  moveWidget: (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => void;
  moveWidgetsByDelta: (ids: readonly string[], dx: number, dy: number) => void;
  resizeWidget: (id: string, size: { w: number; h: number }) => void;
  focusWidget: (id: string) => void;
  revealWidget: (id: string, onReveal?: (id: string) => void) => void;
  hideWidget: (id: string, onHide?: (id: string) => void) => void;
  resetWidgetPosition: (id: string) => void;
  resetDesktopLayout: () => void;
  revealAllHiddenWidgets: (hiddenIds: readonly string[]) => void;

  saveLayoutCommitted: () => void;
  discardLayoutDraft: () => void;
  undoLayout: () => void;
  redoLayout: () => void;
  toggleAutosaveLayout: () => void;
  acknowledgeLayoutSaved: () => void;

  setWidgetSelection: (ids: readonly string[]) => void;
  toggleWidgetInSelection: (id: string, additive: boolean) => void;
  clearWidgetSelection: () => void;
  nudgeSelectedWidgets: (dx: number, dy: number) => void;
  bringSelectedWidgetsToFront: () => void;

  /** Muterar draft om vi är i edit-läge, annars savedLayout. */
  mutateSavedOrDraft: (
    updater: (prev: Record<string, HubDesktopWidgetLayout>) => Record<string, HubDesktopWidgetLayout>,
  ) => void;
};

export type HubSurfaceEngineOptions = {
  layoutEditMode: boolean;
  gridSnapEnabled: boolean;
  prefs: HubPrefs;
  onSaveCommitted?: () => void;
  onDiscardDraft?: () => void;
};

export function useHubSurfaceEngine({
  layoutEditMode,
  gridSnapEnabled,
  prefs,
  onSaveCommitted,
  onDiscardDraft,
}: HubSurfaceEngineOptions): HubSurfaceEngineResult {
  const [savedLayout, setSavedLayout] = useState<Record<string, HubDesktopWidgetLayout>>(() =>
    readDesktopLayoutFromStorage(),
  );
  const [editSession, setEditSession] = useState<DesktopEditSession | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [autosaveLayoutEnabled, setAutosaveLayoutEnabled] = useState(
    readLayoutAutosaveEnabledFromStorage,
  );

  const savedLayoutRef = useRef(savedLayout);
  savedLayoutRef.current = savedLayout;
  const autosaveLayoutEnabledRef = useRef(autosaveLayoutEnabled);
  autosaveLayoutEnabledRef.current = autosaveLayoutEnabled;
  const layoutSyncSerializedRef = useRef<string | null>(null);
  const editSessionRef = useRef<DesktopEditSession | null>(null);
  editSessionRef.current = editSession;
  const layoutEditModeRef = useRef(layoutEditMode);
  layoutEditModeRef.current = layoutEditMode;

  const activeLayout = layoutEditMode && editSession ? editSession.draft : savedLayout;

  // Persista autosave-flaggan
  useEffect(() => {
    writeLayoutAutosaveEnabledToStorage(autosaveLayoutEnabled);
  }, [autosaveLayoutEnabled]);

  // Persista savedLayout
  useEffect(() => {
    writeDesktopLayoutToStorage(savedLayout);
  }, [savedLayout]);

  // Lyssna på remote settings apply
  useEffect(() => {
    const onRemote = (event: Event) => {
      const detail = (event as CustomEvent<HubRemoteApplyDetail>).detail;
      const hasLayout = Boolean(detail?.desktopLayout);
      const hasAutosaveFlag = typeof detail?.layoutAutosaveEnabled === "boolean";
      if (!hasLayout && !hasAutosaveFlag) {
        return;
      }
      const nextLayout = hasLayout
        ? cloneLayoutRecord(detail.desktopLayout!)
        : savedLayoutRef.current;
      const nextAutosave = hasAutosaveFlag
        ? detail.layoutAutosaveEnabled!
        : autosaveLayoutEnabledRef.current;
      layoutSyncSerializedRef.current = JSON.stringify({
        layout: JSON.stringify(nextLayout),
        autosave: nextAutosave,
      });
      if (hasLayout) {
        setSavedLayout(nextLayout);
      }
      if (hasAutosaveFlag) {
        setAutosaveLayoutEnabled(nextAutosave);
      }
    };
    window.addEventListener(HUB_SETTINGS_REMOTE_APPLY_EVENT, onRemote);
    return () => window.removeEventListener(HUB_SETTINGS_REMOTE_APPLY_EVENT, onRemote);
  }, []);

  // Trigga sync vid lokala ändringar
  useEffect(() => {
    const blob = JSON.stringify({
      layout: JSON.stringify(savedLayout),
      autosave: autosaveLayoutEnabled,
    });
    if (layoutSyncSerializedRef.current === null) {
      layoutSyncSerializedRef.current = blob;
      return;
    }
    if (layoutSyncSerializedRef.current === blob) {
      return;
    }
    layoutSyncSerializedRef.current = blob;
    bumpLocalSettingsRevision();
  }, [autosaveLayoutEnabled, savedLayout]);

  // Starta/avsluta edit-session när layoutEditMode ändras
  useEffect(() => {
    if (layoutEditMode) {
      const base = cloneLayoutRecord(savedLayoutRef.current);
      setEditSession({ draft: base, baseline: base, past: [], future: [] });
      setSelectedWidgetIds([]);
    } else {
      setEditSession(null);
      setSelectedWidgetIds([]);
    }
  }, [layoutEditMode]);

  const mutateDraft = useCallback(
    (updater: (prev: Record<string, HubDesktopWidgetLayout>) => Record<string, HubDesktopWidgetLayout>) => {
      setEditSession((session) => {
        if (!session) {
          return session;
        }
        const snapshot = cloneLayoutRecord(session.draft);
        const nextDraft = updater(cloneLayoutRecord(session.draft));
        const nextSession: DesktopEditSession = {
          ...session,
          draft: nextDraft,
          past: [...session.past, snapshot],
          future: [],
        };
        if (autosaveLayoutEnabledRef.current) {
          queueMicrotask(() => {
            if (layoutEditModeRef.current) {
              setSavedLayout(cloneLayoutRecord(nextDraft));
            }
          });
        }
        return nextSession;
      });
    },
    [],
  );

  const mutateSavedOrDraft = useCallback(
    (updater: (prev: Record<string, HubDesktopWidgetLayout>) => Record<string, HubDesktopWidgetLayout>) => {
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(updater);
      } else {
        setSavedLayout((prev) => updater(cloneLayoutRecord(prev)));
      }
    },
    [mutateDraft],
  );

  // --- Layout mutations ---

  const moveWidgetImpl = useCallback(
    (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">, bumpZ: boolean) => {
      const gridStep = gridStepForDensity(prefs.desktop.gridDensity);
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const snap = (v: number) => snapCoord(v, gridSnapEnabled, gridStep, prefs.desktop.snapStrength);
        return {
          ...prev,
          [id]: {
            ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
            x: snap(position.x),
            y: snap(position.y),
            z: bumpZ ? nextDesktopZ(prev) : (prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!).z,
          },
        };
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [gridSnapEnabled, mutateDraft, prefs.desktop.gridDensity, prefs.desktop.snapStrength],
  );

  const moveWidget = useCallback(
    (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => {
      moveWidgetImpl(id, position, true);
    },
    [moveWidgetImpl],
  );

  const moveWidgetsByDelta = useCallback(
    (ids: readonly string[], dx: number, dy: number) => {
      if (ids.length === 0) {
        return;
      }
      const gridStep = gridStepForDensity(prefs.desktop.gridDensity);
      const snap = (v: number) => snapCoord(v, gridSnapEnabled, gridStep, prefs.desktop.snapStrength);
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const next = cloneLayoutRecord(prev);
        const topZ = nextDesktopZ(next);
        let zAssign = topZ;
        for (const wid of ids) {
          const cur = next[wid] ?? DEFAULT_WIDGET_LAYOUTS[wid];
          if (!cur || cur.hidden) {
            continue;
          }
          next[wid] = {
            ...cur,
            x: snap(cur.x + dx),
            y: snap(cur.y + dy),
            z: zAssign++,
          };
        }
        return next;
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [gridSnapEnabled, mutateDraft, prefs.desktop.gridDensity, prefs.desktop.snapStrength],
  );

  const resizeWidget = useCallback(
    (id: string, size: { w: number; h: number }) => {
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
          w: Math.max(MIN_WIDGET_W, Math.round(size.w)),
          h: Math.max(MIN_WIDGET_H, Math.round(size.h)),
          z: nextDesktopZ(prev),
        },
      });
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [mutateDraft],
  );

  const focusWidget = useCallback(
    (id: string) => {
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const current = prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id];
        if (!current) {
          return prev;
        }
        const top = nextDesktopZ(prev);
        if (current.z === top - 1) {
          return prev;
        }
        return { ...prev, [id]: { ...current, z: top } };
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [mutateDraft],
  );

  const revealWidget = useCallback(
    (id: string, onReveal?: (id: string) => void) => {
      mutateSavedOrDraft((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
          hidden: false,
          z: nextDesktopZ(prev),
        },
      }));
      onReveal?.(id);
    },
    [mutateSavedOrDraft],
  );

  const hideWidget = useCallback(
    (id: string, onHide?: (id: string) => void) => {
      mutateSavedOrDraft((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
          hidden: true,
        },
      }));
      setSelectedWidgetIds((sel) => sel.filter((w) => w !== id));
      onHide?.(id);
    },
    [mutateSavedOrDraft],
  );

  const resetWidgetPosition = useCallback(
    (id: string) => {
      mutateSavedOrDraft((prev) => {
        const defaults = DEFAULT_WIDGET_LAYOUTS[id];
        if (!defaults) {
          return prev;
        }
        const current = prev[id] ?? defaults;
        return { ...prev, [id]: { ...defaults, hidden: current.hidden } };
      });
    },
    [mutateSavedOrDraft],
  );

  const resetDesktopLayout = useCallback(() => {
    const defaults = Object.fromEntries(
      Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([wid, layout]) => [wid, { ...layout }]),
    ) as Record<string, HubDesktopWidgetLayout>;
    mutateSavedOrDraft(() => defaults);
  }, [mutateSavedOrDraft]);

  const revealAllHiddenWidgets = useCallback(
    (hiddenIds: readonly string[]) => {
      if (hiddenIds.length === 0) {
        return;
      }
      mutateSavedOrDraft((prev) => {
        let z = nextDesktopZ(prev);
        const next = { ...prev };
        for (const id of hiddenIds) {
          const cur = next[id] ?? DEFAULT_WIDGET_LAYOUTS[id];
          if (!cur) {
            continue;
          }
          next[id] = { ...cur, hidden: false, z: z++ };
        }
        return next;
      });
    },
    [mutateSavedOrDraft],
  );

  // --- Session control ---

  const saveLayoutCommitted = useCallback(() => {
    const s = editSessionRef.current;
    if (!s) {
      onSaveCommitted?.();
      return;
    }
    const committed = cloneLayoutRecord(s.draft);
    setSavedLayout(committed);
    setEditSession({ draft: committed, baseline: committed, past: [], future: [] });
    onSaveCommitted?.();
  }, [onSaveCommitted]);

  const discardLayoutDraft = useCallback(() => {
    setEditSession((s) => {
      if (!s) {
        return s;
      }
      const reverted = cloneLayoutRecord(s.baseline);
      if (autosaveLayoutEnabledRef.current) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(reverted)));
      }
      return { ...s, draft: reverted, past: [], future: [] };
    });
    onDiscardDraft?.();
  }, [onDiscardDraft]);

  const undoLayout = useCallback(() => {
    setEditSession((s) => {
      if (!s || s.past.length === 0) {
        return s;
      }
      const prevDraft = cloneLayoutRecord(s.past[s.past.length - 1]!);
      const newPast = s.past.slice(0, -1);
      const newFuture = [cloneLayoutRecord(s.draft), ...s.future];
      if (autosaveLayoutEnabledRef.current) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(prevDraft)));
      }
      return { ...s, draft: prevDraft, past: newPast, future: newFuture };
    });
  }, []);

  const redoLayout = useCallback(() => {
    setEditSession((s) => {
      if (!s || s.future.length === 0) {
        return s;
      }
      const [nextDraft, ...restFuture] = s.future;
      const newPast = [...s.past, cloneLayoutRecord(s.draft)];
      const draft = cloneLayoutRecord(nextDraft!);
      if (autosaveLayoutEnabledRef.current) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(draft)));
      }
      return { ...s, draft, past: newPast, future: restFuture };
    });
  }, []);

  const toggleAutosaveLayout = useCallback(() => {
    setAutosaveLayoutEnabled((prev) => {
      const next = !prev;
      if (next && editSessionRef.current) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(editSessionRef.current!.draft)));
      }
      return next;
    });
  }, []);

  const acknowledgeLayoutSaved = useCallback(() => {
    saveLayoutCommitted();
  }, [saveLayoutCommitted]);

  // --- Selection ---

  const setWidgetSelection = useCallback((ids: readonly string[]) => {
    setSelectedWidgetIds([...ids]);
  }, []);

  const toggleWidgetInSelection = useCallback((id: string, additive: boolean) => {
    setSelectedWidgetIds((sel) => {
      if (additive) {
        if (sel.includes(id)) {
          return sel.filter((w) => w !== id);
        }
        return [...sel, id];
      }
      return [id];
    });
  }, []);

  const clearWidgetSelection = useCallback(() => {
    setSelectedWidgetIds([]);
  }, []);

  const nudgeSelectedWidgets = useCallback(
    (dx: number, dy: number) => {
      if (selectedWidgetIds.length === 0) {
        return;
      }
      const step = gridSnapEnabled ? HUB_DESKTOP_LAYOUT_GRID : 1;
      const ndx = dx * step;
      const ndy = dy * step;
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const snap = (v: number) => snapCoord(v, gridSnapEnabled, HUB_DESKTOP_LAYOUT_GRID);
        const next = cloneLayoutRecord(prev);
        for (const wid of selectedWidgetIds) {
          const cur = next[wid] ?? DEFAULT_WIDGET_LAYOUTS[wid];
          if (!cur || cur.hidden) {
            continue;
          }
          next[wid] = { ...cur, x: snap(cur.x + ndx), y: snap(cur.y + ndy) };
        }
        return next;
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [gridSnapEnabled, mutateDraft, selectedWidgetIds],
  );

  const bringSelectedWidgetsToFront = useCallback(() => {
    if (selectedWidgetIds.length === 0) {
      return;
    }
    const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
      const next = cloneLayoutRecord(prev);
      let z = nextDesktopZ(next);
      for (const wid of selectedWidgetIds) {
        const cur = next[wid] ?? DEFAULT_WIDGET_LAYOUTS[wid];
        if (!cur || cur.hidden) {
          continue;
        }
        next[wid] = { ...cur, z: z++ };
      }
      return next;
    };
    if (layoutEditModeRef.current && editSessionRef.current) {
      mutateDraft(apply);
    } else {
      setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
    }
  }, [mutateDraft, selectedWidgetIds]);

  const isLayoutDirty =
    Boolean(editSession) && !layoutRecordsEqual(editSession!.draft, editSession!.baseline);
  const canUndoLayout = (editSession?.past.length ?? 0) > 0;
  const canRedoLayout = (editSession?.future.length ?? 0) > 0;

  return {
    activeLayout,
    savedLayout,
    editSession,
    selectedWidgetIds,
    autosaveLayoutEnabled,
    isLayoutDirty,
    canUndoLayout,
    canRedoLayout,
    moveWidget,
    moveWidgetsByDelta,
    resizeWidget,
    focusWidget,
    revealWidget,
    hideWidget,
    resetWidgetPosition,
    resetDesktopLayout,
    revealAllHiddenWidgets,
    saveLayoutCommitted,
    discardLayoutDraft,
    undoLayout,
    redoLayout,
    toggleAutosaveLayout,
    acknowledgeLayoutSaved,
    setWidgetSelection,
    toggleWidgetInSelection,
    clearWidgetSelection,
    nudgeSelectedWidgets,
    bringSelectedWidgetsToFront,
    mutateSavedOrDraft,
  };
}
