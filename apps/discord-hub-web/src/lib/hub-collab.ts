import type { TeamMode } from "@/lib/spin-the-wheel";

export type WheelCollabDraft = {
  rawParticipants: string;
  teamCount: number;
  teamMode: TeamMode;
  seed: string;
};

export type WheelCollabAction = {
  id: string;
  kind: "spin" | "teams";
  participants: string[];
  winner: string | null;
  teams: string[][];
  seedUsed: string | null;
  triggeredById: string;
  triggeredByName: string;
  createdAt: string;
};

export type WheelCollabPresence = {
  clientId: number;
  userId: string;
  name: string;
};

export function normalizeWheelCollabRoom(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function wheelCollabServerUrl(): string {
  const explicit = import.meta.env.VITE_WHEEL_COLLAB_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const apiBase = import.meta.env.VITE_API_URL?.trim();
  if (apiBase) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    url.port = url.port || (url.protocol === "wss:" ? "443" : "80");
    return url.toString().replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:3002`;
  }

  return "ws://127.0.0.1:3002";
}
