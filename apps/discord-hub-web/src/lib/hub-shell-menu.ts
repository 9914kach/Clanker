import type { HubActionApi } from "@/config/hub-actions";
import type { HubDesktopShellState } from "@/hooks/use-hub-layout";
import type { HubCopy } from "@/i18n/hub-copy";
import type { HubContextMenuItem, HubContextMenuSection, HubContextTarget } from "@/lib/hub-shell-context";

function section(id: string, label: string | undefined, items: Array<HubContextMenuItem | null>): HubContextMenuSection | null {
  const filtered = items.filter((item): item is HubContextMenuItem => Boolean(item));
  if (filtered.length === 0) {
    return null;
  }
  return { id, label, items: filtered };
}

function toAbsoluteUrl(href: string): string {
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return href;
  }
}

export function buildHubShellMenu(params: {
  copy: HubCopy;
  target: HubContextTarget;
  actions: HubActionApi;
  desktopShell: HubDesktopShellState | null;
  toggleDockPin?: (toolId: string) => void;
}): HubContextMenuSection[] {
  const { copy, target, actions, desktopShell, toggleDockPin } = params;
  const m = copy.shellMenu;
  const c = copy.common;

  if (target.type === "shell.surface") {
    const hiddenWidgets =
      desktopShell?.widgets.filter((widget) => desktopShell.hiddenWidgetIds.includes(widget.id)) ?? [];

    return [
      section("desktop-primary", target.area === "desktop" ? m.desktop : m.neutralenOs, [
        actions.openCommandPalette
          ? {
              id: "desktop-command",
              label: m.openCommandBar,
              shortcut: "Ctrl/⌘ K",
              onSelect: actions.openCommandPalette,
            }
          : null,
        {
          id: "desktop-palette",
          label: m.cyclePalette,
          onSelect: actions.cyclePalette,
        },
        {
          id: "desktop-audio",
          label: desktopShell?.audioEnabled ? m.muteAudio : m.enableAudio,
          checked: desktopShell?.audioEnabled ?? false,
          onSelect: desktopShell?.toggleAudio ?? actions.toggleAudio,
        },
      ]),
      section(
        "desktop-widgets",
        hiddenWidgets.length > 0 ? m.spawnWidget : undefined,
        hiddenWidgets.map((widget) => ({
          id: `spawn-${widget.id}`,
          label: widget.label,
          onSelect: () => desktopShell?.revealWidget(widget.id),
        })),
      ),
      section("desktop-system", m.system, [
        desktopShell
          ? {
              id: "desktop-reset",
              label: m.resetDesktop,
              onSelect: desktopShell.resetLayout,
            }
          : null,
        {
          id: "desktop-refresh",
          label: m.refreshShell,
          onSelect: actions.refreshSession,
        },
        {
          id: "desktop-chaos",
          label: m.chaosPulse,
          tone: "chaos",
          onSelect: desktopShell?.triggerChaos ?? actions.summonGoblin,
        },
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "shell.nav") {
    return [
      section("nav-open", m.shell, [
        {
          id: "nav-dashboard",
          label: m.openDashboard,
          onSelect: actions.openDashboard,
        },
        {
          id: "nav-wheel",
          label: m.openWheel,
          onSelect: actions.openWheel,
        },
        actions.openProfile
          ? {
              id: "nav-profile",
              label: m.openMyProfile,
              onSelect: actions.openProfile,
            }
          : null,
        {
          id: "nav-settings",
          label: m.openSettings,
          onSelect: actions.openSettings,
        },
      ]),
      section("nav-system", m.system, [
        actions.openCommandPalette
          ? {
              id: "nav-command",
              label: m.openCommandBar,
              onSelect: actions.openCommandPalette,
            }
          : null,
        {
          id: "nav-refresh",
          label: m.refreshShell,
          onSelect: actions.refreshSession,
        },
        {
          id: "nav-palette",
          label: m.cyclePalette,
          onSelect: actions.cyclePalette,
        },
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "shell.identity") {
    return [
      section("identity-copy", m.identity, [
        target.profileHandle
          ? {
              id: "identity-handle",
              label: m.copyHandle,
              onSelect: actions.copyHandle ?? (() => undefined),
            }
          : null,
        target.profileId
          ? {
              id: "identity-id",
              label: m.copyDiscordId,
              onSelect: actions.copyDiscordId ?? (() => undefined),
            }
          : null,
      ]),
      section("identity-open", m.open, [
        actions.openProfile
          ? {
              id: "identity-profile",
              label: m.openProfile,
              onSelect: actions.openProfile,
            }
          : null,
        {
          id: "identity-settings",
          label: m.openSettings,
          onSelect: actions.openSettings,
        },
        actions.openCommandPalette
          ? {
              id: "identity-command",
              label: m.openCommandBar,
              onSelect: actions.openCommandPalette,
            }
          : null,
      ]),
      section("identity-system", undefined, [
        {
          id: "identity-logout",
          label: m.logOut,
          tone: "danger",
          onSelect: actions.logout,
        },
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "widget") {
    return [
      section("widget-main", target.widgetLabel, [
        desktopShell
          ? {
              id: "widget-hide",
              label: m.hideWidget,
              onSelect: () => desktopShell.hideWidget(target.widgetId),
            }
          : null,
        actions.openCommandPalette
          ? {
              id: "widget-command",
              label: m.openCommandBar,
              onSelect: actions.openCommandPalette,
            }
          : null,
      ]),
      section("widget-system", m.shell, [
        {
          id: "widget-palette",
          label: m.cyclePalette,
          onSelect: actions.cyclePalette,
        },
        {
          id: "widget-chaos",
          label: m.chaosPulse,
          tone: "chaos",
          onSelect: desktopShell?.triggerChaos ?? actions.summonGoblin,
        },
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "tool") {
    return [
      section("tool-main", target.label, [
        {
          id: "tool-open",
          label: m.openModule,
          onSelect: () => actions.openPath(target.path),
        },
        {
          id: "tool-open-tab",
          label: m.openInNewTab,
          onSelect: () => window.open(target.path, "_blank", "noopener,noreferrer"),
        },
        {
          id: "tool-copy",
          label: m.copyModulePath,
          onSelect: () => actions.copyText(target.path, c.copied, target.path),
        },
        toggleDockPin
          ? {
              id: "tool-pin",
              label: target.pinned ? m.unpinDock : m.pinDock,
              onSelect: () => toggleDockPin(target.toolId),
            }
          : null,
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "profile") {
    const profileUrl = target.profilePath ? toAbsoluteUrl(target.profilePath) : null;

    return [
      section("profile-open", target.label ?? m.profile, [
        target.profilePath
          ? {
              id: "profile-open",
              label: m.openProfile,
              onSelect: () => actions.openPath(target.profilePath!),
            }
          : null,
        target.isOwnProfile
          ? {
              id: "profile-settings",
              label: m.openSettings,
              onSelect: actions.openSettings,
            }
          : null,
        profileUrl
          ? {
              id: "profile-copy",
              label: m.copyProfileLink,
              onSelect: () => actions.copyText(profileUrl, c.copied, profileUrl),
            }
          : null,
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "panel") {
    return [
      section("panel-shell", target.panelLabel, [
        actions.openCommandPalette
          ? {
              id: "panel-command",
              label: m.openCommandBar,
              onSelect: actions.openCommandPalette,
            }
          : null,
        {
          id: "panel-dashboard",
          label: m.returnToDesktop,
          onSelect: actions.openDashboard,
        },
        {
          id: "panel-refresh",
          label: m.refreshShell,
          onSelect: actions.refreshSession,
        },
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  return [
    section("link-main", target.label ?? m.link, [
      {
        id: "link-open",
        label: target.external ? m.openLinkNewTab : m.openLink,
        onSelect: () => {
          if (target.external) {
            window.open(target.href, "_blank", "noopener,noreferrer");
            return;
          }
          actions.openPath(target.href, "panel");
        },
      },
      {
        id: "link-copy",
        label: m.copyLinkAddress,
        onSelect: () => {
          const absoluteUrl = target.external ? target.href : toAbsoluteUrl(target.href);
          actions.copyText(absoluteUrl, c.copied, absoluteUrl);
        },
      },
    ]),
  ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
}
