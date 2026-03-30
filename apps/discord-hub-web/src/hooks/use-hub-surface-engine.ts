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
 * - Ingen förändring i HubDesktopShellState (selektion för nudge m.m. finns kvar i hooken).
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
  effectiveSnapStep,
  snapCoord,
  type HubDesktopWidgetLayout,
} from "@/lib/hub-desktop-layout";
import {
  desktopLayoutToNodes,
  nodesToDesktopLayout,
  normalizeNodeMap,
  geometriesFromDesktopLayout,
  type HubGridGeometry,
  type HubGridNode,
  type HubGridNodeMap,
} from "@/lib/hub-grid-node";
import type { HubPrefs } from "@/lib/hub-prefs";
import { clampWidgetDimensions } from "@/lib/hub-widget-size-bounds";
const FALLBACK_LAYOUT: HubDesktopWidgetLayout = {
  x: 0,
  y: 0,
  w: 320,
  h: 240,
  z: 1,
  hidden: false,
};

type DesktopEditSession = {
  draft: HubGridNodeMap;
  baseline: HubGridNodeMap;
  past: HubGridNodeMap[];
  future: HubGridNodeMap[];
};

function cloneNodeMap(nodes: Readonly<HubGridNodeMap>): HubGridNodeMap {
  const next: HubGridNodeMap = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!node) {
      continue;
    }
    next[id] = {
      ...node,
      geometry: node.geometry ? { ...node.geometry } : null,
      metadata: { ...(node.metadata ?? {}) },
    };
  }
  return next;
}

function nodeMapsEqual(a: Readonly<HubGridNodeMap>, b: Readonly<HubGridNodeMap>): boolean {
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
    const na = a[id];
    const nb = b[id];
    if (!na || !nb) {
      return false;
    }
    if (na.kind !== nb.kind || na.hidden !== nb.hidden || na.containerId !== nb.containerId) {
      return false;
    }
    const ga = na.geometry;
    const gb = nb.geometry;
    if (!ga || !gb) {
      if (ga !== gb) {
        return false;
      }
      continue;
    }
    if (ga.x !== gb.x || ga.y !== gb.y || ga.w !== gb.w || ga.h !== gb.h || ga.z !== gb.z) {
      return false;
    }
  }
  return true;
}

function fallbackGeometry(): HubGridGeometry {
  return {
    x: FALLBACK_LAYOUT.x,
    y: FALLBACK_LAYOUT.y,
    w: FALLBACK_LAYOUT.w,
    h: FALLBACK_LAYOUT.h,
    z: FALLBACK_LAYOUT.z,
  };
}

function nextDesktopZ(nodes: Readonly<HubGridNodeMap>): number {
  return Math.max(0, ...Object.values(nodes).map((n) => n.geometry?.z ?? 0)) + 1;
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

  moveWidget: (
    id: string,
    position: Pick<HubDesktopWidgetLayout, "x" | "y">,
    options?: { snap?: boolean; bumpZ?: boolean },
  ) => void;
  moveWidgetsByDelta: (ids: readonly string[], dx: number, dy: number, options?: { snap?: boolean }) => void;
  resizeWidget: (id: string, size: { w: number; h: number }, options?: { snap?: boolean }) => void;
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

  /** Muterar draft om vi är i edit-läge, annars saved layout (deriverad från nodes). */
  mutateSavedOrDraft: (
    updater: (prev: HubGridNodeMap) => HubGridNodeMap,
  ) => void;
};

export type HubSurfaceEngineOptions = {
  layoutEditMode: boolean;
  gridSnapEnabled: boolean;
  gridStep: number;
  prefs: HubPrefs;
  /**
   * Defaults för denna yta (id -> layout). Dashboard använder DEFAULT_WIDGET_LAYOUTS.
   * Routes (t.ex. PublicProfile i Fas 4) kan ange containers här.
   */
  defaultLayouts?: Readonly<Record<string, HubDesktopWidgetLayout>>;
  /**
   * Persistens-gränssnitt. Kan overridas för att:
   * - undvika att skriva till dashboard-nyckeln
   * - spara under en annan localStorage-nyckel
   * - köra helt in-memory (no-op write)
   */
  persistence?: Partial<{
    readLayout: () => Record<string, HubDesktopWidgetLayout>;
    writeLayout: (layout: Record<string, HubDesktopWidgetLayout>) => void;
    readAutosaveEnabled: () => boolean;
    writeAutosaveEnabled: (enabled: boolean) => void;
  }>;
  /** Dashboard syncar layout via remote-settings events. Stäng av för route-specifika ytor. */
  enableRemoteSync?: boolean;
  onSaveCommitted?: () => void;
  onDiscardDraft?: () => void;
};

export function useHubSurfaceEngine({
  layoutEditMode,
  gridSnapEnabled,
  gridStep,
  prefs,
  defaultLayouts,
  persistence,
  enableRemoteSync = true,
  onSaveCommitted,
  onDiscardDraft,
}: HubSurfaceEngineOptions): HubSurfaceEngineResult {
  const defaultsRef = useRef(defaultLayouts ?? DEFAULT_WIDGET_LAYOUTS);
  defaultsRef.current = defaultLayouts ?? DEFAULT_WIDGET_LAYOUTS;
  const defaultGeometriesRef = useRef(geometriesFromDesktopLayout(defaultsRef.current));
  defaultGeometriesRef.current = geometriesFromDesktopLayout(defaultsRef.current);

  const persistenceRef = useRef({
    readLayout: readDesktopLayoutFromStorage,
    writeLayout: writeDesktopLayoutToStorage,
    readAutosaveEnabled: readLayoutAutosaveEnabledFromStorage,
    writeAutosaveEnabled: writeLayoutAutosaveEnabledToStorage,
    ...(persistence ?? {}),
  });
  persistenceRef.current = {
    readLayout: readDesktopLayoutFromStorage,
    writeLayout: writeDesktopLayoutToStorage,
    readAutosaveEnabled: readLayoutAutosaveEnabledFromStorage,
    writeAutosaveEnabled: writeLayoutAutosaveEnabledToStorage,
    ...(persistence ?? {}),
  };

  const [savedNodes, setSavedNodes] = useState<HubGridNodeMap>(() => {
    const read = persistenceRef.current.readLayout ?? readDesktopLayoutFromStorage;
    const layout = read();
    const nodes = desktopLayoutToNodes(layout);
    return normalizeNodeMap(nodes, defaultGeometriesRef.current);
  });
  const [editSession, setEditSession] = useState<DesktopEditSession | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [autosaveLayoutEnabled, setAutosaveLayoutEnabled] = useState(() => {
    const read = persistenceRef.current.readAutosaveEnabled ?? readLayoutAutosaveEnabledFromStorage;
    return read();
  });

  const savedNodesRef = useRef(savedNodes);
  savedNodesRef.current = savedNodes;
  const autosaveLayoutEnabledRef = useRef(autosaveLayoutEnabled);
  autosaveLayoutEnabledRef.current = autosaveLayoutEnabled;
  const layoutSyncSerializedRef = useRef<string | null>(null);
  const editSessionRef = useRef<DesktopEditSession | null>(null);
  editSessionRef.current = editSession;
  const layoutEditModeRef = useRef(layoutEditMode);
  layoutEditModeRef.current = layoutEditMode;

  const activeNodes = layoutEditMode && editSession ? editSession.draft : savedNodes;
  const activeLayout = nodesToDesktopLayout(activeNodes);
  const savedLayout = nodesToDesktopLayout(savedNodes);

  // Persista autosave-flaggan
  useEffect(() => {
    persistenceRef.current.writeAutosaveEnabled?.(autosaveLayoutEnabled);
  }, [autosaveLayoutEnabled]);

  // Persista saved layout
  useEffect(() => {
    persistenceRef.current.writeLayout?.(nodesToDesktopLayout(savedNodes));
  }, [savedNodes]);

  // Lyssna på remote settings apply
  useEffect(() => {
    if (!enableRemoteSync) {
      return;
    }
    const onRemote = (event: Event) => {
      const detail = (event as CustomEvent<HubRemoteApplyDetail>).detail;
      const hasLayout = Boolean(detail?.desktopLayout);
      const hasAutosaveFlag = typeof detail?.layoutAutosaveEnabled === "boolean";
      if (!hasLayout && !hasAutosaveFlag) {
        return;
      }
      const nextNodes = hasLayout
        ? normalizeNodeMap(desktopLayoutToNodes(detail.desktopLayout!), defaultGeometriesRef.current)
        : savedNodesRef.current;
      const nextAutosave = hasAutosaveFlag
        ? detail.layoutAutosaveEnabled!
        : autosaveLayoutEnabledRef.current;
      layoutSyncSerializedRef.current = JSON.stringify({
        layout: JSON.stringify(nodesToDesktopLayout(nextNodes)),
        autosave: nextAutosave,
      });
      if (hasLayout) {
        setSavedNodes(nextNodes);
      }
      if (hasAutosaveFlag) {
        setAutosaveLayoutEnabled(nextAutosave);
      }
    };
    window.addEventListener(HUB_SETTINGS_REMOTE_APPLY_EVENT, onRemote);
    return () => window.removeEventListener(HUB_SETTINGS_REMOTE_APPLY_EVENT, onRemote);
  }, [enableRemoteSync]);

  // Trigga sync vid lokala ändringar
  useEffect(() => {
    if (!enableRemoteSync) {
      return;
    }
    const blob = JSON.stringify({
      layout: JSON.stringify(nodesToDesktopLayout(savedNodes)),
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
  }, [autosaveLayoutEnabled, enableRemoteSync, savedNodes]);

  // Starta/avsluta edit-session när layoutEditMode ändras
  useEffect(() => {
    if (layoutEditMode) {
      const base = cloneNodeMap(savedNodesRef.current);
      setEditSession({ draft: base, baseline: base, past: [], future: [] });
      setSelectedWidgetIds([]);
    } else {
      setEditSession(null);
      setSelectedWidgetIds([]);
    }
  }, [layoutEditMode]);

  const mutateDraft = useCallback(
    (updater: (prev: HubGridNodeMap) => HubGridNodeMap) => {
      setEditSession((session) => {
        if (!session) {
          return session;
        }
        const snapshot = cloneNodeMap(session.draft);
        const nextDraft = updater(cloneNodeMap(session.draft));
        const nextSession: DesktopEditSession = {
          ...session,
          draft: nextDraft,
          past: [...session.past, snapshot],
          future: [],
        };
        if (autosaveLayoutEnabledRef.current) {
          queueMicrotask(() => {
            if (layoutEditModeRef.current) {
              setSavedNodes(cloneNodeMap(nextDraft));
            }
          });
        }
        return nextSession;
      });
    },
    [],
  );

  const mutateSavedOrDraft = useCallback(
    (updater: (prev: HubGridNodeMap) => HubGridNodeMap) => {
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(updater);
      } else {
        setSavedNodes((prev) => updater(cloneNodeMap(prev)));
      }
    },
    [mutateDraft],
  );

  // --- Layout mutations ---

  const baseNodeForId = useCallback(
    (prev: HubGridNodeMap, id: string): HubGridNode => {
      const existing = prev[id];
      if (existing) {
        if (existing.geometry) {
          return existing;
        }
        const geo = defaultGeometriesRef.current[id] ?? fallbackGeometry();
        return { ...existing, geometry: { ...geo } } as HubGridNode;
      }
      const geo = defaultGeometriesRef.current[id] ?? fallbackGeometry();
      const created: HubGridNode = {
        id,
        kind: "widget",
        geometry: { ...geo },
        hidden: false,
        containerId: null,
        metadata: {},
      };
      return created;
    },
    [],
  );

  const moveWidgetImpl = useCallback(
    (
      id: string,
      position: Pick<HubDesktopWidgetLayout, "x" | "y">,
      bumpZ: boolean,
      snap = true,
    ) => {
      const apply = (prev: HubGridNodeMap) => {
        const shouldSnap = snap && gridSnapEnabled;
        const snapFn = (v: number) =>
          shouldSnap ? snapCoord(v, true, gridStep, prefs.desktop.snapStrength) : Math.round(v);
        const next = cloneNodeMap(prev);
        const base = baseNodeForId(next, id);
        const geo = base.geometry ?? fallbackGeometry();
        next[id] = {
          ...base,
          geometry: {
            ...geo,
            x: snapFn(position.x),
            y: snapFn(position.y),
            z: bumpZ ? nextDesktopZ(next) : geo.z,
          },
        };
        return next;
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedNodes((prev) => apply(cloneNodeMap(prev)));
      }
    },
    [baseNodeForId, gridSnapEnabled, gridStep, mutateDraft, prefs.desktop.snapStrength],
  );

  const moveWidget = useCallback(
    (
      id: string,
      position: Pick<HubDesktopWidgetLayout, "x" | "y">,
      options?: { snap?: boolean; bumpZ?: boolean },
    ) => {
      moveWidgetImpl(id, position, options?.bumpZ !== false, options?.snap !== false);
    },
    [moveWidgetImpl],
  );

  const moveWidgetsByDelta = useCallback(
    (ids: readonly string[], dx: number, dy: number, options?: { snap?: boolean }) => {
      if (ids.length === 0) {
        return;
      }
      const shouldSnap = options?.snap !== false && gridSnapEnabled;
      const snap = (v: number) => snapCoord(v, true, gridStep, prefs.desktop.snapStrength);
      const apply = (prev: HubGridNodeMap) => {
        const next = cloneNodeMap(prev);
        const anchorId = ids.find((wid) => {
          const cur = next[wid];
          return Boolean(cur && cur.geometry && !cur.hidden);
        });
        if (!anchorId) {
          return next;
        }
        const anchor = next[anchorId] ?? baseNodeForId(next, anchorId);
        if (!anchor || !anchor.geometry) {
          return next;
        }
        const resolvedDx = shouldSnap ? snap(anchor.geometry.x + dx) - anchor.geometry.x : dx;
        const resolvedDy = shouldSnap ? snap(anchor.geometry.y + dy) - anchor.geometry.y : dy;
        const topZ = nextDesktopZ(next);
        let zAssign = topZ;
        for (const wid of ids) {
          const cur = next[wid] ?? baseNodeForId(next, wid);
          if (!cur || !cur.geometry || cur.hidden) {
            continue;
          }
          next[wid] = {
            ...cur,
            geometry: {
              ...cur.geometry,
              x: cur.geometry.x + resolvedDx,
              y: cur.geometry.y + resolvedDy,
              z: zAssign++,
            },
          };
        }
        return next;
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedNodes((prev) => apply(cloneNodeMap(prev)));
      }
    },
    [baseNodeForId, gridSnapEnabled, gridStep, mutateDraft, prefs.desktop.snapStrength],
  );

  const resizeWidget = useCallback(
    (id: string, size: { w: number; h: number }, options?: { snap?: boolean }) => {
      const shouldSnap = options?.snap !== false;
      const apply = (prev: HubGridNodeMap) => {
        const base = baseNodeForId(prev, id);
        const geo = base.geometry ?? fallbackGeometry();
        const wSnapped =
          shouldSnap && gridSnapEnabled
            ? snapCoord(size.w, true, gridStep, prefs.desktop.snapStrength)
            : Math.round(size.w);
        const hSnapped =
          shouldSnap && gridSnapEnabled
            ? snapCoord(size.h, true, gridStep, prefs.desktop.snapStrength)
            : Math.round(size.h);
        const { w, h } = clampWidgetDimensions(id, wSnapped, hSnapped);
        return {
          ...prev,
          [id]: {
            ...base,
            geometry: {
              ...geo,
              w,
              h,
              z: nextDesktopZ(prev),
            },
          },
        };
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedNodes((prev) => apply(cloneNodeMap(prev)));
      }
    },
    [baseNodeForId, gridSnapEnabled, gridStep, mutateDraft, prefs.desktop.snapStrength],
  );

  const focusWidget = useCallback(
    (id: string) => {
      const apply = (prev: HubGridNodeMap) => {
        const current = prev[id] ?? baseNodeForId(prev, id);
        if (!current || !current.geometry) {
          return prev;
        }
        const top = nextDesktopZ(prev);
        if (current.geometry.z === top - 1) {
          return prev;
        }
        return {
          ...prev,
          [id]: {
            ...current,
            geometry: { ...current.geometry, z: top },
          },
        };
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedNodes((prev) => apply(cloneNodeMap(prev)));
      }
    },
    [baseNodeForId, mutateDraft],
  );

  const revealWidget = useCallback(
    (id: string, onReveal?: (id: string) => void) => {
      mutateSavedOrDraft((prev) => {
        const base = baseNodeForId(prev, id);
        const geo = base.geometry ?? fallbackGeometry();
        return {
          ...prev,
          [id]: {
            ...base,
            hidden: false,
            geometry: { ...geo, z: nextDesktopZ(prev) },
          },
        };
      });
      onReveal?.(id);
    },
    [baseNodeForId, mutateSavedOrDraft],
  );

  const hideWidget = useCallback(
    (id: string, onHide?: (id: string) => void) => {
      mutateSavedOrDraft((prev) => {
        const base = baseNodeForId(prev, id);
        return {
          ...prev,
          [id]: {
            ...base,
            hidden: true,
          },
        };
      });
      setSelectedWidgetIds((sel) => sel.filter((w) => w !== id));
      onHide?.(id);
    },
    [baseNodeForId, mutateSavedOrDraft],
  );

  const resetWidgetPosition = useCallback(
    (id: string) => {
      mutateSavedOrDraft((prev) => {
        const defaults = defaultGeometriesRef.current[id];
        if (!defaults) {
          return prev;
        }
        const current = baseNodeForId(prev, id);
        return {
          ...prev,
          [id]: {
            ...current,
            geometry: { ...defaults },
            hidden: current.hidden,
          },
        };
      });
    },
    [baseNodeForId, mutateSavedOrDraft],
  );

  const resetDesktopLayout = useCallback(() => {
    const defaults = desktopLayoutToNodes(defaultsRef.current);
    const normalized = normalizeNodeMap(defaults, defaultGeometriesRef.current);
    mutateSavedOrDraft(() => normalized);
  }, [mutateSavedOrDraft]);

  const revealAllHiddenWidgets = useCallback(
    (hiddenIds: readonly string[]) => {
      if (hiddenIds.length === 0) {
        return;
      }
      mutateSavedOrDraft((prev) => {
        let z = nextDesktopZ(prev);
        const next = cloneNodeMap(prev);
        for (const id of hiddenIds) {
          const cur = next[id] ?? baseNodeForId(next, id);
          if (!cur || !cur.geometry) {
            continue;
          }
          next[id] = {
            ...cur,
            hidden: false,
            geometry: { ...cur.geometry, z: z++ },
          };
        }
        return next;
      });
    },
    [baseNodeForId, mutateSavedOrDraft],
  );

  // --- Session control ---

  const saveLayoutCommitted = useCallback(() => {
    const s = editSessionRef.current;
    if (!s) {
      onSaveCommitted?.();
      return;
    }
    const committed = cloneNodeMap(s.draft);
    setSavedNodes(committed);
    setEditSession({ draft: committed, baseline: committed, past: [], future: [] });
    onSaveCommitted?.();
  }, [onSaveCommitted]);

  const discardLayoutDraft = useCallback(() => {
    setEditSession((s) => {
      if (!s) {
        return s;
      }
      const reverted = cloneNodeMap(s.baseline);
      if (autosaveLayoutEnabledRef.current) {
        queueMicrotask(() => setSavedNodes(cloneNodeMap(reverted)));
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
      const prevDraft = cloneNodeMap(s.past[s.past.length - 1]!);
      const newPast = s.past.slice(0, -1);
      const newFuture = [cloneNodeMap(s.draft), ...s.future];
      if (autosaveLayoutEnabledRef.current) {
        queueMicrotask(() => setSavedNodes(cloneNodeMap(prevDraft)));
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
      const newPast = [...s.past, cloneNodeMap(s.draft)];
      const draft = cloneNodeMap(nextDraft!);
      if (autosaveLayoutEnabledRef.current) {
        queueMicrotask(() => setSavedNodes(cloneNodeMap(draft)));
      }
      return { ...s, draft, past: newPast, future: restFuture };
    });
  }, []);

  const toggleAutosaveLayout = useCallback(() => {
    setAutosaveLayoutEnabled((prev) => {
      const next = !prev;
      if (next && editSessionRef.current) {
        queueMicrotask(() => setSavedNodes(cloneNodeMap(editSessionRef.current!.draft)));
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
      const step = gridSnapEnabled ? effectiveSnapStep(gridStep, prefs.desktop.snapStrength) : 1;
      const ndx = dx * step;
      const ndy = dy * step;
      const apply = (prev: HubGridNodeMap) => {
        const snap = (v: number) =>
          gridSnapEnabled ? snapCoord(v, true, gridStep, prefs.desktop.snapStrength) : Math.round(v);
        const next = cloneNodeMap(prev);
        for (const wid of selectedWidgetIds) {
          const cur = next[wid] ?? baseNodeForId(next, wid);
          if (!cur || !cur.geometry || cur.hidden) {
            continue;
          }
          next[wid] = {
            ...cur,
            geometry: {
              ...cur.geometry,
              x: snap(cur.geometry.x + ndx),
              y: snap(cur.geometry.y + ndy),
            },
          };
        }
        return next;
      };
      if (layoutEditModeRef.current && editSessionRef.current) {
        mutateDraft(apply);
      } else {
        setSavedNodes((prev) => apply(cloneNodeMap(prev)));
      }
    },
    [baseNodeForId, gridSnapEnabled, gridStep, mutateDraft, prefs.desktop.snapStrength, selectedWidgetIds],
  );

  const bringSelectedWidgetsToFront = useCallback(() => {
    if (selectedWidgetIds.length === 0) {
      return;
    }
    const apply = (prev: HubGridNodeMap) => {
      const next = cloneNodeMap(prev);
      let z = nextDesktopZ(next);
      for (const wid of selectedWidgetIds) {
        const cur = next[wid] ?? baseNodeForId(next, wid);
        if (!cur || !cur.geometry || cur.hidden) {
          continue;
        }
        next[wid] = { ...cur, geometry: { ...cur.geometry, z: z++ } };
      }
      return next;
    };
    if (layoutEditModeRef.current && editSessionRef.current) {
      mutateDraft(apply);
    } else {
      setSavedNodes((prev) => apply(cloneNodeMap(prev)));
    }
  }, [baseNodeForId, mutateDraft, selectedWidgetIds]);

  const isLayoutDirty =
    Boolean(editSession) && !nodeMapsEqual(editSession!.draft, editSession!.baseline);
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
