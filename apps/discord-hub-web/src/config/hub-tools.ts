import type { ComponentType } from "react";
import { Dices, Home, Settings, UserRound } from "lucide-react";

export type HubToolTone = "useful" | "social" | "chaos";

export type HubTool = {
  id: string;
  label: string;
  description: string;
  path: string;
  tone: readonly HubToolTone[];
  icon: ComponentType<{ className?: string }>;
};

export const HUB_TOOLS: readonly HubTool[] = [
  {
    id: "dashboard",
    label: "Home",
    description: "Status lights, modules, and whatever the system is up to.",
    path: "/dashboard",
    tone: ["useful", "social"],
    icon: Home,
  },
  {
    id: "spin-the-wheel",
    label: "Wheel",
    description: "Fate spinner + team randomizer. Blame the wheel, not me.",
    path: "/tools/spin-the-wheel",
    tone: ["useful", "chaos"],
    icon: Dices,
  },
  {
    id: "profile-settings",
    label: "Settings",
    description: "Tweak your vibe and integrations.",
    path: "/profile/settings",
    tone: ["social", "useful"],
    icon: Settings,
  },
];

export const HUB_ME_TOOL = {
  id: "me",
  label: "Me",
  description: "Your public profile. Do not perceive too hard.",
  tone: ["social"] as const,
  icon: UserRound,
};

export function hubToolById(id: string): HubTool | null {
  return HUB_TOOLS.find((t) => t.id === id) ?? null;
}

