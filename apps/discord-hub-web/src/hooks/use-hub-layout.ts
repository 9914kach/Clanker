import { useOutletContext } from "react-router-dom";

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
};

export function useHubLayout(): HubLayoutContextValue {
  return useOutletContext<HubLayoutContextValue>();
}
