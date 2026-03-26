import { useOutletContext } from "react-router-dom";
import type { HubActionTone } from "@/config/hub-actions";

export type HubProfile = {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
  banner: string | null;
  accent_color: number | null;
};

export type HubSessionState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; profile: HubProfile }
  | { status: "backend_error" };

export type HubLayoutContextValue = {
  me: HubSessionState;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  openCommandPalette: () => void;
  setDesktopShellState: (state: HubDesktopShellState | null) => void;
  /** When true, desktop modules can be moved/rearranged; shell objects show edit chrome. */
  layoutEditMode: boolean;
  setLayoutEditMode: (value: boolean) => void;
  toggleLayoutEditMode: () => void;
  /** Snap dragged desktop modules to a grid while editing (desktop only). */
  gridSnapEnabled: boolean;
  setGridSnapEnabled: (value: boolean) => void;
  toggleGridSnap: () => void;
};

export type HubDesktopShellWidget = {
  id: string;
  label: string;
  tone: HubActionTone;
};

export type HubDesktopShellState = {
  widgets: readonly HubDesktopShellWidget[];
  hiddenWidgetIds: readonly string[];
  audioEnabled: boolean;
  revealWidget: (id: string) => void;
  hideWidget: (id: string) => void;
  resetLayout: () => void;
  triggerChaos: () => void;
  toggleAudio: () => void;
  focusWidget: (id: string) => void;
  resetWidgetPosition: (id: string) => void;
  /** Scroll to module spawn / sleeping modules and prompt the user. */
  openAddModuleFlow: () => void;
  /** Wake every hidden desktop module at once. */
  revealAllHiddenWidgets: () => void;
  /** Commit draft layout to persisted storage (and session baseline). */
  saveLayoutCommitted: () => void;
  /** Revert draft to the snapshot taken when this edit session started. */
  discardLayoutDraft: () => void;
  undoLayout: () => void;
  redoLayout: () => void;
  canUndoLayout: boolean;
  canRedoLayout: boolean;
  /** Draft differs from session baseline (unsaved in this session). */
  isLayoutDirty: boolean;
  autosaveLayoutEnabled: boolean;
  toggleAutosaveLayout: () => void;
  selectedWidgetIds: readonly string[];
  setWidgetSelection: (ids: readonly string[]) => void;
  toggleWidgetInSelection: (id: string, additive: boolean) => void;
  clearWidgetSelection: () => void;
  nudgeSelectedWidgets: (dx: number, dy: number) => void;
  bringSelectedWidgetsToFront: () => void;
  moveWidget: (id: string, position: { x: number; y: number }) => void;
  moveWidgetsByDelta: (ids: readonly string[], dx: number, dy: number) => void;
  resizeWidget: (id: string, size: { w: number; h: number }) => void;
  /** @deprecated Use saveLayoutCommitted; kept for context menu parity. */
  acknowledgeLayoutSaved: () => void;
};

export function useHubLayout(): HubLayoutContextValue {
  return useOutletContext<HubLayoutContextValue>();
}
