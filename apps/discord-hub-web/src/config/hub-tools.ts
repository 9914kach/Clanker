import type { ComponentType } from "react";
import { Dices, Home, Settings, UserRound } from "lucide-react";
import type { HubCopy } from "@/i18n/hub-copy";

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

export function localizeHubTools(copy: HubCopy): HubTool[] {
  return HUB_TOOLS.map((tool) => {
    const localized =
      tool.id === "dashboard"
        ? copy.tools.dashboard
        : tool.id === "spin-the-wheel"
          ? copy.tools.spinTheWheel
          : copy.tools.profileSettings;
    return {
      ...tool,
      label: localized.label,
      description: localized.description,
    };
  });
}

export function localizeMeTool(copy: HubCopy, path: string): HubTool {
  return {
    ...HUB_ME_TOOL,
    label: copy.tools.me.label,
    description: copy.tools.me.description,
    path,
  };
}

