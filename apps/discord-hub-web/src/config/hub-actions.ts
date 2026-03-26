import type { ComponentType } from "react";
import {
  Copy,
  Dices,
  Home,
  LogOut,
  Palette,
  RefreshCw,
  Settings,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ColorPalette } from "@/components/theme-provider";

export type HubActionSection = "Navigation" | "System" | "Chaos";
export type HubActionTone = "useful" | "social" | "chaos";
export type HubToastKind = "info" | "success" | "error" | "chaos";

export type HubAction = {
  id: string;
  label: string;
  description: string;
  section: HubActionSection;
  tone: HubActionTone;
  keywords?: readonly string[];
  shortcut?: string;
  icon: ComponentType<{ className?: string }>;
  discoverability?: "default" | "hidden";
  revealKeywords?: readonly string[];
  onSelect: () => void;
};

type ToastInput = {
  kind?: HubToastKind;
  title: string;
  message?: string | null;
};

const PALETTES: readonly ColorPalette[] = [
  "violett-neutral",
  "green",
  "terminal-dark-russian",
];

export function nextColorPalette(current: ColorPalette): ColorPalette {
  const index = PALETTES.indexOf(current);
  return PALETTES[(index + 1) % PALETTES.length] ?? PALETTES[0]!;
}

export function buildHubActions(params: {
  profilePath: string | null;
  profileId: string | null;
  profileHandle: string | null;
  navigate: (path: string) => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  colorPalette: ColorPalette;
  setColorPalette: (palette: ColorPalette) => void;
  audioEnabled: boolean;
  toggleAudio: () => void;
  play: (sound: "dock" | "panel" | "confirm" | "chaos") => void;
  notify: (toast: ToastInput) => void;
}): HubAction[] {
  const cyclePalette = () => {
    const next = nextColorPalette(params.colorPalette);
    params.setColorPalette(next);
    params.play("panel");
    params.notify({
      kind: "success",
      title: "Palette switched",
      message: next,
    });
  };

  const writeToClipboard = (value: string, title: string, message: string) => {
    void navigator.clipboard.writeText(value).then(
      () => {
        params.play("confirm");
        params.notify({ kind: "info", title, message });
      },
      () => {
        params.notify({
          kind: "error",
          title: "Clipboard blocked",
          message: "The browser refused to write that value.",
        });
      },
    );
  };

  const refreshSession = () => {
    void params.refreshSession().then(
      () => {
        params.play("confirm");
        params.notify({
          kind: "success",
          title: "Session refreshed",
          message: "Identity and shell state asked the backend to wake up.",
        });
      },
      () => {
        params.notify({
          kind: "error",
          title: "Refresh failed",
          message: "The hub API didn’t answer in time.",
        });
      },
    );
  };

  const actions: HubAction[] = [
    {
      id: "nav-dashboard",
      label: "Open dashboard",
      description: "Jump to the main Neutralen OS surface.",
      section: "Navigation",
      tone: "useful",
      shortcut: "G D",
      keywords: ["home", "dashboard", "desktop", "hub"],
      icon: Home,
      onSelect: () => params.navigate("/dashboard"),
    },
    {
      id: "nav-wheel",
      label: "Open wheel",
      description: "Launch the fate spinner and team randomizer.",
      section: "Navigation",
      tone: "chaos",
      shortcut: "G W",
      keywords: ["spin", "wheel", "teams", "random"],
      icon: Dices,
      onSelect: () => params.navigate("/tools/spin-the-wheel"),
    },
    {
      id: "nav-settings",
      label: "Open settings",
      description: "Tweak your profile vibe and integrations.",
      section: "Navigation",
      tone: "social",
      shortcut: "G S",
      keywords: ["settings", "profile", "integrations"],
      icon: Settings,
      onSelect: () => params.navigate("/profile/settings"),
    },
    {
      id: "system-refresh-session",
      label: "Refresh session state",
      description: "Re-read identity and shell status from the backend.",
      section: "System",
      tone: "useful",
      keywords: ["refresh", "reload", "session", "identity", "profile"],
      icon: RefreshCw,
      onSelect: refreshSession,
    },
    {
      id: "system-cycle-palette",
      label: "Cycle color palette",
      description: "Switch the current UI palette to a different mood.",
      section: "System",
      tone: "useful",
      keywords: ["theme", "palette", "color", "mode"],
      icon: Palette,
      onSelect: cyclePalette,
    },
    {
      id: "system-audio",
      label: params.audioEnabled ? "Mute Clanker sounds" : "Enable Clanker sounds",
      description: params.audioEnabled
        ? "Silence tiny fanfares and button noises."
        : "Let the system click back at you.",
      section: "System",
      tone: "useful",
      keywords: ["audio", "sound", "mute", "volume"],
      icon: params.audioEnabled ? VolumeX : Volume2,
      onSelect: () => {
        const nextEnabled = !params.audioEnabled;
        params.toggleAudio();
        params.play(nextEnabled ? "confirm" : "panel");
        params.notify({
          kind: "info",
          title: nextEnabled ? "Audio armed" : "Audio muted",
          message: nextEnabled ? "Tiny noises are back online." : "The system will sulk in silence.",
        });
      },
    },
    {
      id: "system-copy-seed",
      label: "Copy wheel seed starter",
      description: "Put a fresh seed name on the clipboard for future disputes.",
      section: "System",
      tone: "chaos",
      keywords: ["copy", "clipboard", "seed", "wheel", "random"],
      icon: Copy,
      onSelect: () =>
        writeToClipboard(
          `hub-${new Date().toISOString().slice(0, 10)}`,
          "Seed copied",
          "Freshly harvested for future disputes.",
        ),
    },
    {
      id: "system-log-out",
      label: "Log out",
      description: "Exit the hub shell and drop back to the login gate.",
      section: "System",
      tone: "social",
      keywords: ["logout", "sign out", "auth", "leave"],
      icon: LogOut,
      onSelect: () => {
        void params.logout();
      },
    },
    {
      id: "chaos-goblin",
      label: "Summon goblin protocol",
      description: "Fire an unnecessary but emotionally correct system message.",
      section: "Chaos",
      tone: "chaos",
      keywords: ["goblin", "chaos", "easter egg", "meme"],
      discoverability: "hidden",
      revealKeywords: ["goblin", "protocol", "meme"],
      icon: Sparkles,
      onSelect: () => {
        params.play("chaos");
        params.notify({
          kind: "chaos",
          title: "Goblin protocol armed",
          message: "The system approves exactly none of this.",
        });
      },
    },
    {
      id: "chaos-hamster",
      label: "Appease the server hamster",
      description: "Offer spiritual maintenance to the tiny creature in the rack.",
      section: "Chaos",
      tone: "chaos",
      keywords: ["hamster", "server", "ritual", "snack"],
      discoverability: "hidden",
      revealKeywords: ["hamster", "snack", "ritual"],
      icon: Sparkles,
      onSelect: () => {
        params.play("chaos");
        params.notify({
          kind: "chaos",
          title: "Hamster appeased",
          message: "Latency improved spiritually, if not technically.",
        });
      },
    },
  ];

  if (params.profilePath) {
    actions.splice(2, 0, {
      id: "nav-profile",
      label: "Open my profile",
      description: "Jump straight to your public profile card.",
      section: "Navigation",
      tone: "social",
      keywords: ["me", "profile", "identity"],
      icon: UserRound,
      onSelect: () => params.navigate(params.profilePath!),
    });
  }

  if (params.profileId) {
    actions.splice(5, 0, {
      id: "system-copy-discord-id",
      label: "Copy Discord ID",
      description: "Copy your numeric Discord identifier to the clipboard.",
      section: "System",
      tone: "social",
      keywords: ["copy", "clipboard", "discord", "id", "identity"],
      icon: Copy,
      onSelect: () =>
        writeToClipboard(params.profileId!, "Copied", `Discord ID: ${params.profileId}`),
    });
  }

  if (params.profileHandle) {
    actions.splice(6, 0, {
      id: "system-copy-handle",
      label: "Copy handle",
      description: "Copy your @handle for quick sharing.",
      section: "System",
      tone: "social",
      keywords: ["copy", "clipboard", "handle", "username", "discord"],
      icon: Copy,
      onSelect: () =>
        writeToClipboard(params.profileHandle!, "Copied", params.profileHandle!),
    });
  }

  return actions;
}
