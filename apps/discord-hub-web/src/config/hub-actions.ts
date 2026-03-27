import type { ComponentType } from "react";
import {
  Copy,
  Dices,
  Home,
  LogOut,
  Palette,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ColorPalette } from "@/components/theme-provider";
import type { HubCopy } from "@/i18n/hub-copy";

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

export type HubActionEnvironment = {
  copy: HubCopy;
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
  openCommandPalette?: () => void;
};

export type HubActionApi = {
  openPath: (path: string, sound?: "dock" | "panel" | "confirm" | "chaos") => void;
  openDashboard: () => void;
  openWheel: () => void;
  openSettings: () => void;
  openProfile: (() => void) | null;
  openCommandPalette: (() => void) | null;
  refreshSession: () => void;
  cyclePalette: () => void;
  toggleAudio: () => void;
  copyWheelSeed: () => void;
  copyDiscordId: (() => void) | null;
  copyHandle: (() => void) | null;
  copyText: (value: string, title: string, message: string) => void;
  logout: () => void;
  summonGoblin: () => void;
  appeaseHamster: () => void;
};

type ToastInput = {
  kind?: HubToastKind;
  title: string;
  message?: string | null;
};

const PALETTES: readonly ColorPalette[] = [
  "carbon",
  "slate-ocean",
  "bubblegum",
  "citrus-pop",
  "goblin",
  "midnight-acid",
  "violett-neutral",
  "green",
  "terminal-dark-russian",
];

export function nextColorPalette(current: ColorPalette): ColorPalette {
  const index = PALETTES.indexOf(current);
  return PALETTES[(index + 1) % PALETTES.length] ?? PALETTES[0]!;
}

export function createHubActionApi(params: HubActionEnvironment): HubActionApi {
  const { copy } = params;
  const t = copy.actions.toasts;

  const cyclePalette = () => {
    const next = nextColorPalette(params.colorPalette);
    params.setColorPalette(next);
    params.play("panel");
    params.notify({
      kind: "success",
      title: t.paletteSwitched,
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
          title: t.clipboardBlocked,
          message: t.clipboardBlockedMessage,
        });
      },
    );
  };

  const openPath = (path: string, sound: "dock" | "panel" | "confirm" | "chaos" = "dock") => {
    params.play(sound);
    params.navigate(path);
  };

  const refreshSession = () => {
    void params.refreshSession().then(
      () => {
        params.play("confirm");
        params.notify({
          kind: "success",
          title: t.sessionRefreshed,
          message: t.sessionRefreshedMessage,
        });
      },
      () => {
        params.notify({
          kind: "error",
          title: t.refreshFailed,
          message: t.refreshFailedMessage,
        });
      },
    );
  };

  const toggleAudio = () => {
    const nextEnabled = !params.audioEnabled;
    params.toggleAudio();
    params.play(nextEnabled ? "confirm" : "panel");
    params.notify({
      kind: "info",
      title: nextEnabled ? t.audioArmed : t.audioMuted,
      message: nextEnabled ? t.audioArmedMessage : t.audioMutedMessage,
    });
  };

  const copyWheelSeed = () =>
    writeToClipboard(`hub-${new Date().toISOString().slice(0, 10)}`, t.seedCopied, t.seedCopiedMessage);

  const summonGoblin = () => {
    params.play("chaos");
    params.notify({
      kind: "chaos",
      title: t.goblinTitle,
      message: t.goblinMessage,
    });
  };

  const appeaseHamster = () => {
    params.play("chaos");
    params.notify({
      kind: "chaos",
      title: t.hamsterTitle,
      message: t.hamsterMessage,
    });
  };

  return {
    openPath,
    openDashboard: () => openPath("/dashboard"),
    openWheel: () => openPath("/tools/spin-the-wheel"),
    openSettings: () => openPath("/profile/settings"),
    openProfile: params.profilePath ? () => openPath(params.profilePath!) : null,
    openCommandPalette: params.openCommandPalette
      ? () => {
          params.play("panel");
          params.openCommandPalette?.();
        }
      : null,
    refreshSession,
    cyclePalette,
    toggleAudio,
    copyWheelSeed,
    copyDiscordId: params.profileId
      ? () =>
          writeToClipboard(
            params.profileId!,
            copy.common.copied,
            t.copiedDiscordId(params.profileId!),
          )
      : null,
    copyHandle: params.profileHandle
      ? () =>
          writeToClipboard(params.profileHandle!, copy.common.copied, params.profileHandle!)
      : null,
    copyText: writeToClipboard,
    logout: () => {
      void params.logout();
    },
    summonGoblin,
    appeaseHamster,
  };
}

export function buildHubActions(params: HubActionEnvironment): HubAction[] {
  const actionApi = createHubActionApi(params);
  const a = params.copy.actions;

  const actions: HubAction[] = [
    {
      id: "nav-dashboard",
      label: a.navDashboard.label,
      description: a.navDashboard.description,
      section: "Navigation",
      tone: "useful",
      shortcut: "G D",
      keywords: a.navDashboard.keywords,
      icon: Home,
      onSelect: actionApi.openDashboard,
    },
    {
      id: "nav-wheel",
      label: a.navWheel.label,
      description: a.navWheel.description,
      section: "Navigation",
      tone: "chaos",
      shortcut: "G W",
      keywords: a.navWheel.keywords,
      icon: Dices,
      onSelect: actionApi.openWheel,
    },
    {
      id: "nav-settings",
      label: a.navSettings.label,
      description: a.navSettings.description,
      section: "Navigation",
      tone: "social",
      shortcut: "G S",
      keywords: a.navSettings.keywords,
      icon: Settings,
      onSelect: actionApi.openSettings,
    },
    {
      id: "system-open-command",
      label: a.systemCommand.label,
      description: a.systemCommand.description,
      section: "System",
      tone: "useful",
      keywords: a.systemCommand.keywords,
      icon: Search,
      onSelect: actionApi.openCommandPalette ?? (() => undefined),
    },
    {
      id: "system-refresh-session",
      label: a.systemRefresh.label,
      description: a.systemRefresh.description,
      section: "System",
      tone: "useful",
      keywords: a.systemRefresh.keywords,
      icon: RefreshCw,
      onSelect: actionApi.refreshSession,
    },
    {
      id: "system-cycle-palette",
      label: a.systemPalette.label,
      description: a.systemPalette.description,
      section: "System",
      tone: "useful",
      keywords: a.systemPalette.keywords,
      icon: Palette,
      onSelect: actionApi.cyclePalette,
    },
    {
      id: "system-audio",
      label: params.audioEnabled ? a.systemAudioMute.label : a.systemAudioEnable.label,
      description: params.audioEnabled ? a.systemAudioMute.description : a.systemAudioEnable.description,
      section: "System",
      tone: "useful",
      keywords: params.audioEnabled ? a.systemAudioMute.keywords : a.systemAudioEnable.keywords,
      icon: params.audioEnabled ? VolumeX : Volume2,
      onSelect: actionApi.toggleAudio,
    },
    {
      id: "system-copy-seed",
      label: a.systemCopySeed.label,
      description: a.systemCopySeed.description,
      section: "System",
      tone: "chaos",
      keywords: a.systemCopySeed.keywords,
      icon: Copy,
      onSelect: actionApi.copyWheelSeed,
    },
    {
      id: "system-log-out",
      label: a.systemLogout.label,
      description: a.systemLogout.description,
      section: "System",
      tone: "social",
      keywords: a.systemLogout.keywords,
      icon: LogOut,
      onSelect: actionApi.logout,
    },
    {
      id: "chaos-goblin",
      label: a.chaosGoblin.label,
      description: a.chaosGoblin.description,
      section: "Chaos",
      tone: "chaos",
      keywords: a.chaosGoblin.keywords,
      discoverability: "hidden",
      revealKeywords: a.chaosGoblin.reveal,
      icon: Sparkles,
      onSelect: actionApi.summonGoblin,
    },
    {
      id: "chaos-hamster",
      label: a.chaosHamster.label,
      description: a.chaosHamster.description,
      section: "Chaos",
      tone: "chaos",
      keywords: a.chaosHamster.keywords,
      discoverability: "hidden",
      revealKeywords: a.chaosHamster.reveal,
      icon: Sparkles,
      onSelect: actionApi.appeaseHamster,
    },
  ];

  if (actionApi.openProfile) {
    actions.splice(2, 0, {
      id: "nav-profile",
      label: a.navProfile.label,
      description: a.navProfile.description,
      section: "Navigation",
      tone: "social",
      keywords: a.navProfile.keywords,
      icon: UserRound,
      onSelect: actionApi.openProfile,
    });
  }

  if (actionApi.copyDiscordId) {
    actions.splice(6, 0, {
      id: "system-copy-discord-id",
      label: a.systemCopyDiscord.label,
      description: a.systemCopyDiscord.description,
      section: "System",
      tone: "social",
      keywords: a.systemCopyDiscord.keywords,
      icon: Copy,
      onSelect: actionApi.copyDiscordId,
    });
  }

  if (actionApi.copyHandle) {
    actions.splice(7, 0, {
      id: "system-copy-handle",
      label: a.systemCopyHandle.label,
      description: a.systemCopyHandle.description,
      section: "System",
      tone: "social",
      keywords: a.systemCopyHandle.keywords,
      icon: Copy,
      onSelect: actionApi.copyHandle,
    });
  }

  return actions;
}
