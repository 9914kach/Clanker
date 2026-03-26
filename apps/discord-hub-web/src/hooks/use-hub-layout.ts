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
};

export function useHubLayout(): HubLayoutContextValue {
  return useOutletContext<HubLayoutContextValue>();
}
