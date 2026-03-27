import type { HubActionApi } from "@/config/hub-actions";
import type { HubDesktopShellState } from "@/hooks/use-hub-layout";
import type { HubCopy } from "@/i18n/hub-copy";
import type { HubContextMenuItem, HubContextMenuSection, HubContextTarget } from "@/lib/hub-shell-context";
import { classifyTarget, getCapabilities, isEditable } from "@/lib/hub-shell-classification";
import { isExternalNavPath } from "@/lib/hub-nav-bookmarks";
import type { HubPrimaryNavItemId } from "@/lib/hub-shell-layout-order";

function openNavBookmarkDestination(path: string, actions: HubActionApi): void {
  const t = path.trim();
  if (isExternalNavPath(t)) {
    if (t.startsWith("mailto:") || t.startsWith("tel:")) {
      window.location.href = t;
      return;
    }
    window.open(t, "_blank", "noopener,noreferrer");
    return;
  }
  const internal = t.startsWith("/") ? t : `/${t}`;
  actions.openPath(internal);
}

function navBookmarkCopyTarget(path: string): string {
  const t = path.trim();
  if (isExternalNavPath(t)) {
    return t;
  }
  const internal = t.startsWith("/") ? t : `/${t}`;
  return toAbsoluteUrl(internal);
}

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

function layoutModeSection(
  m: HubCopy["shellMenu"],
  layoutEditMode: boolean,
  toggleLayoutEditMode?: () => void,
): HubContextMenuSection | null {
  if (!toggleLayoutEditMode) {
    return null;
  }
  return section("shell-layout", m.shell, [
    {
      id: "toggle-layout-edit",
      label: layoutEditMode ? m.exitLayoutEdit : m.enterLayoutEdit,
      checked: layoutEditMode,
      onSelect: toggleLayoutEditMode,
    },
  ]);
}

function editExitSection(m: HubCopy["shellMenu"], toggleLayoutEditMode?: () => void): HubContextMenuSection | null {
  if (!toggleLayoutEditMode) {
    return null;
  }
  return section("edit-exit", m.layoutEditing, [
    {
      id: "toggle-layout-edit-exit",
      label: m.exitLayoutEdit,
      checked: true,
      onSelect: toggleLayoutEditMode,
    },
  ]);
}

export function buildHubShellMenu(params: {
  copy: HubCopy;
  target: HubContextTarget;
  actions: HubActionApi;
  desktopShell: HubDesktopShellState | null;
  toggleDockPin?: (toolId: string) => void;
  layoutEditMode: boolean;
  toggleLayoutEditMode?: () => void;
  onInfoToast?: (title: string, message?: string | null) => void;
  gridSnapEnabled: boolean;
  toggleGridSnap?: () => void;
  isDashboardRoute: boolean;
  onNavBookmarkAdd?: () => void;
  onNavBookmarkEdit?: (bookmarkId: string) => void;
  onNavBookmarkDelete?: (bookmarkId: string) => void;
  onPrimaryNavEdit?: (navId: HubPrimaryNavItemId) => void;
}): HubContextMenuSection[] {
  const {
    copy,
    target,
    actions,
    desktopShell,
    toggleDockPin,
    layoutEditMode,
    toggleLayoutEditMode,
    onInfoToast,
    gridSnapEnabled,
    toggleGridSnap,
    isDashboardRoute,
    onNavBookmarkAdd,
    onNavBookmarkEdit,
    onNavBookmarkDelete,
    onPrimaryNavEdit,
  } = params;
  const m = copy.shellMenu;
  const em = copy.editMode;
  const c = copy.common;
  const pn = copy.primaryNav;
  const policyRoute = isDashboardRoute ? "/dashboard" : "/route";
  const policyMode = layoutEditMode ? "layout" : "normal";

  const desktopOnly =
    (fn: () => void) =>
    () => {
      if (!isDashboardRoute) {
        onInfoToast?.(em.desktopOnlyToast, null);
        return;
      }
      fn();
    };

  if (target.type === "shell.surface") {
    const hiddenWidgets =
      desktopShell?.widgets.filter((widget) => desktopShell.hiddenWidgetIds.includes(widget.id)) ?? [];

    if (layoutEditMode && target.area === "desktop") {
      return [
        editExitSection(m, toggleLayoutEditMode),
        section("edit-desktop-controls", m.layoutEditing, [
          toggleGridSnap
            ? {
                id: "edit-grid-snap",
                label: gridSnapEnabled ? m.gridSnapOff : m.gridSnapOn,
                checked: gridSnapEnabled,
                onSelect: toggleGridSnap,
              }
            : null,
          desktopShell
            ? {
                id: "edit-add-widget",
                label: m.addModule,
                onSelect: () => undefined,
                children:
                  hiddenWidgets.length > 0
                    ? hiddenWidgets.map((widget) => ({
                        id: `edit-add-widget-${widget.id}`,
                        label: widget.label,
                        onSelect: desktopOnly(() => desktopShell.revealWidget(widget.id)),
                      }))
                    : undefined,
              }
            : null,
          hiddenWidgets.length > 0 && desktopShell
            ? {
                id: "edit-restore-all",
                label: m.restoreAllHidden,
                onSelect: desktopOnly(() => desktopShell.revealAllHiddenWidgets()),
              }
            : null,
        ]),
        section("edit-desktop-arrange", m.shell, [
          desktopShell
            ? {
                id: "edit-undo-layout",
                label: m.undoLayout,
                shortcut: "Ctrl/⌘ Z",
                disabled: !desktopShell.canUndoLayout,
                onSelect: desktopOnly(desktopShell.undoLayout),
              }
            : null,
          desktopShell
            ? {
                id: "edit-redo-layout",
                label: m.redoLayout,
                shortcut: "Ctrl/⌘ ⇧ Z",
                disabled: !desktopShell.canRedoLayout,
                onSelect: desktopOnly(desktopShell.redoLayout),
              }
            : null,
          desktopShell
            ? {
                id: "edit-discard-layout",
                label: m.discardLayoutDraft,
                onSelect: desktopOnly(desktopShell.discardLayoutDraft),
              }
            : null,
          desktopShell
            ? {
                id: "edit-save-layout",
                label: m.saveLayoutCommitted,
                onSelect: desktopOnly(desktopShell.saveLayoutCommitted),
              }
            : null,
          desktopShell
            ? {
                id: "edit-autosave-layout",
                label: desktopShell.autosaveLayoutEnabled ? m.autosaveLayoutOff : m.autosaveLayoutOn,
                checked: desktopShell.autosaveLayoutEnabled,
                onSelect: desktopOnly(desktopShell.toggleAutosaveLayout),
              }
            : null,
          desktopShell
            ? {
                id: "edit-reset-desktop",
                label: m.resetDesktop,
                onSelect: desktopOnly(desktopShell.resetLayout),
              }
            : null,
        ]),
        section("desktop-usage-deferred", m.shellUsageWhileEditing, [
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
        section("desktop-system", m.system, [
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

    return [
      layoutModeSection(m, layoutEditMode, toggleLayoutEditMode),
      section("desktop-primary", target.area === "desktop" ? m.desktop : m.neutralenOs, [
        desktopShell && hiddenWidgets.length > 0
          ? {
              id: "desktop-add-widget",
              label: m.addModule,
              onSelect: () => undefined,
              children: hiddenWidgets.map((widget) => ({
                id: `desktop-add-widget-${widget.id}`,
                label: widget.label,
                onSelect: desktopOnly(() => desktopShell.revealWidget(widget.id)),
              })),
            }
          : null,
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
    if (layoutEditMode) {
      return [
        editExitSection(m, toggleLayoutEditMode),
        section("edit-nav-layout", m.layoutEditing, [
          toggleGridSnap
            ? {
                id: "edit-nav-snap",
                label: gridSnapEnabled ? m.gridSnapOff : m.gridSnapOn,
                checked: gridSnapEnabled,
                onSelect: toggleGridSnap,
              }
            : null,
          desktopShell
            ? {
                id: "edit-nav-add-mod",
                label: m.addModule,
                onSelect: desktopOnly(desktopShell.openAddModuleFlow),
              }
            : null,
          hiddenWidgetsCount(desktopShell) > 0 && desktopShell
            ? {
                id: "edit-nav-restore",
                label: m.restoreAllHidden,
                onSelect: desktopOnly(() => desktopShell.revealAllHiddenWidgets()),
              }
            : null,
          desktopShell
            ? {
                id: "edit-nav-reset",
                label: m.resetDesktop,
                onSelect: desktopOnly(desktopShell.resetLayout),
              }
            : null,
        ]),
        section("nav-open", m.shellUsageWhileEditing, [
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

    return [
      layoutModeSection(m, layoutEditMode, toggleLayoutEditMode),
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
    const base = [
      layoutEditMode
        ? editExitSection(m, toggleLayoutEditMode)
        : null,
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
    ];
    return base.filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "widget") {
    const widgetClassification = classifyTarget(target, policyRoute);
    const widgetCaps = getCapabilities(widgetClassification, policyMode, policyRoute);
    if (layoutEditMode && desktopShell) {
      return [
        section("widget-edit", m.layoutEditing, [
          {
            id: "widget-focus",
            label: m.focusWidget,
            onSelect: () => desktopShell.focusWidget(target.widgetId),
          },
          {
            id: "widget-reset-pos",
            label: m.resetWidgetPosition,
            onSelect: () => desktopShell.resetWidgetPosition(target.widgetId),
          },
          widgetCaps.hideable
            ? {
                id: "widget-hide",
                label: m.hideWidget,
                onSelect: () => desktopShell.hideWidget(target.widgetId),
              }
            : null,
        ]),
        section("widget-usage", m.shellUsageWhileEditing, [
          actions.openCommandPalette
            ? {
                id: "widget-command",
                label: m.openCommandBar,
                onSelect: actions.openCommandPalette,
              }
            : null,
        ]),
      ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
    }

    return [
      section("widget-main", target.widgetLabel, [
        desktopShell && widgetCaps.hideable
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
      layoutEditMode && desktopShell
        ? section("widget-arrange", m.shell, [
            {
              id: "widget-focus",
              label: m.focusWidget,
              onSelect: () => desktopShell.focusWidget(target.widgetId),
            },
            {
              id: "widget-reset-pos",
              label: m.resetWidgetPosition,
              onSelect: () => desktopShell.resetWidgetPosition(target.widgetId),
            },
          ])
        : null,
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

  // Användarbokmärken (navBookmark). Systemflikar är tool/panel/profile — inte samma meny som tom nav-yta (shell.object/navGroup).
  if (target.type === "navBookmark") {
    const path = target.path.trim();
    const open = () => openNavBookmarkDestination(path, actions);
    const openTab = () => {
      if (isExternalNavPath(path)) {
        window.open(path.trim(), "_blank", "noopener,noreferrer");
        return;
      }
      const rel = path.startsWith("/") ? path : `/${path}`;
      window.open(toAbsoluteUrl(rel), "_blank", "noopener,noreferrer");
    };
    const copyPath = () => {
      const clip = navBookmarkCopyTarget(path);
      actions.copyText(clip, c.copied, clip);
    };

    if (layoutEditMode) {
      return [
        editExitSection(m, toggleLayoutEditMode),
        section("nav-bm-edit", copy.navBookmarks.contextMenuManageSection, [
          onNavBookmarkEdit
            ? {
                id: "nb-edit",
                label: copy.navBookmarks.editBookmark,
                onSelect: () => onNavBookmarkEdit(target.bookmarkId),
              }
            : null,
          onNavBookmarkDelete
            ? {
                id: "nb-del",
                label: copy.navBookmarks.deleteBookmark,
                tone: "danger",
                onSelect: () => onNavBookmarkDelete(target.bookmarkId),
              }
            : null,
        ]),
        section("nav-bm-use", m.shellUsageWhileEditing, [
          {
            id: "nb-open",
            label: m.openModule,
            onSelect: open,
          },
          {
            id: "nb-tab",
            label: m.openInNewTab,
            onSelect: openTab,
          },
          {
            id: "nb-copy",
            label: m.copyModulePath,
            onSelect: copyPath,
          },
        ]),
      ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
    }

    return [
      section("nav-bm-main", target.label, [
        {
          id: "nb-open",
          label: m.openModule,
          onSelect: open,
        },
        {
          id: "nb-tab",
          label: m.openInNewTab,
          onSelect: openTab,
        },
        {
          id: "nb-copy",
          label: m.copyModulePath,
          onSelect: copyPath,
        },
        onNavBookmarkEdit
          ? {
              id: "nb-edit",
              label: copy.navBookmarks.editBookmark,
              onSelect: () => onNavBookmarkEdit(target.bookmarkId),
            }
          : null,
        onNavBookmarkDelete
          ? {
              id: "nb-del",
              label: copy.navBookmarks.deleteBookmark,
              tone: "danger",
              onSelect: () => onNavBookmarkDelete(target.bookmarkId),
            }
          : null,
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "navPrimary") {
    const path = target.path.trim();
    const open = () => actions.openPath(path);
    const openTab = () => window.open(path, "_blank", "noopener,noreferrer");
    const copyPath = () => {
      const clip = toAbsoluteUrl(path);
      actions.copyText(clip, c.copied, clip);
    };

    if (layoutEditMode) {
      return [
        editExitSection(m, toggleLayoutEditMode),
        section("nav-primary-edit", m.layoutEditing, [
          onPrimaryNavEdit
            ? {
                id: "nav-primary-edit",
                label: pn.editLabel,
                onSelect: () => onPrimaryNavEdit(target.navId as HubPrimaryNavItemId),
              }
            : null,
        ]),
        section("nav-primary-use", m.shellUsageWhileEditing, [
          {
            id: "nav-primary-open",
            label: m.openModule,
            onSelect: open,
          },
          {
            id: "nav-primary-tab",
            label: m.openInNewTab,
            onSelect: openTab,
          },
          {
            id: "nav-primary-copy",
            label: m.copyModulePath,
            onSelect: copyPath,
          },
        ]),
      ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
    }

    return [
      section("nav-primary-main", target.label, [
        {
          id: "nav-primary-open",
          label: m.openModule,
          onSelect: open,
        },
        {
          id: "nav-primary-tab",
          label: m.openInNewTab,
          onSelect: openTab,
        },
        {
          id: "nav-primary-copy",
          label: m.copyModulePath,
          onSelect: copyPath,
        },
        onPrimaryNavEdit
          ? {
              id: "nav-primary-edit",
              label: pn.editLabel,
              onSelect: () => onPrimaryNavEdit(target.navId as HubPrimaryNavItemId),
            }
          : null,
      ]),
    ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
  }

  if (target.type === "tool") {
    if (layoutEditMode) {
      return [
        editExitSection(m, toggleLayoutEditMode),
        section("tool-edit", m.layoutEditing, [
          toggleDockPin
            ? {
                id: "tool-pin",
                label: target.pinned ? m.unpinDock : m.pinDock,
                onSelect: () => toggleDockPin(target.toolId),
              }
            : null,
        ]),
        section("tool-open", m.shellUsageWhileEditing, [
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
        ]),
      ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
    }

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
      layoutEditMode ? editExitSection(m, toggleLayoutEditMode) : null,
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
    if (layoutEditMode) {
      return [
        editExitSection(m, toggleLayoutEditMode),
        section("panel-edit", m.layoutEditing, [
          {
            id: "panel-dashboard",
            label: m.returnToDesktop,
            onSelect: actions.openDashboard,
          },
        ]),
        section("panel-shell", m.shellUsageWhileEditing, [
          actions.openCommandPalette
            ? {
                id: "panel-command",
                label: m.openCommandBar,
                onSelect: actions.openCommandPalette,
              }
            : null,
          {
            id: "panel-refresh",
            label: m.refreshShell,
            onSelect: actions.refreshSession,
          },
        ]),
      ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
    }

    return [
      layoutModeSection(m, layoutEditMode, toggleLayoutEditMode),
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

  if (target.type === "shell.object") {
    const placeholder = (id: string, label: string) =>
      onInfoToast
        ? {
            id,
            label,
            onSelect: () => onInfoToast(label, null),
          }
        : null;
    const shellObjectEditableInLayout = isEditable(target, policyRoute, policyMode);

    const routePanelItems: Array<HubContextMenuItem | null> =
      target.kind === "routePanel"
        ? [
            actions.openCommandPalette
              ? {
                  id: "route-panel-command",
                  label: m.openCommandBar,
                  onSelect: actions.openCommandPalette,
                }
              : null,
            {
              id: "route-panel-dashboard",
              label: m.returnToDesktop,
              onSelect: actions.openDashboard,
            },
            {
              id: "route-panel-refresh",
              label: m.refreshShell,
              onSelect: actions.refreshSession,
            },
          ]
        : [];

    if (layoutEditMode && shellObjectEditableInLayout) {
      return [
        editExitSection(m, toggleLayoutEditMode),
        // navGroup: bara "Lägg till bokmärke" här — redigera/ta bort för enskilda bokmärken sker via target navBookmark på själva fliken.
        section("shell-object-edit", m.layoutEditing, [
          target.kind === "navGroup" && onNavBookmarkAdd
            ? {
                id: "obj-add-bookmark",
                label: copy.navBookmarks.addFromNavGroup,
                onSelect: onNavBookmarkAdd,
              }
            : null,
          placeholder("obj-dup", m.duplicatePlaceholder),
          placeholder("obj-detach", m.detachPlaceholder),
        ]),
        section(
          "shell-object-meta",
          m.shellUsageWhileEditing,
          (
            [
              ...routePanelItems,
              target.kind === "dockBar"
                ? {
                    id: "obj-open-dashboard",
                    label: m.openDashboard,
                    onSelect: actions.openDashboard,
                  }
                : null,
              (target.kind === "navGroup" || target.kind === "brandBlock") && actions.openCommandPalette
                ? {
                    id: "obj-open-command",
                    label: m.openCommandBar,
                    onSelect: actions.openCommandPalette,
                  }
                : null,
            ] as Array<HubContextMenuItem | null>
          ).filter((item): item is HubContextMenuItem => Boolean(item)),
        ),
      ].filter((menu): menu is HubContextMenuSection => Boolean(menu));
    }

    return [
      layoutModeSection(m, layoutEditMode, toggleLayoutEditMode),
      section("shell-object", `${m.shellObject} · ${target.label}`, [
        ...routePanelItems,
        target.kind === "dockBar"
          ? {
              id: "obj-open-dashboard",
              label: m.openDashboard,
              onSelect: actions.openDashboard,
            }
          : null,
        (target.kind === "navGroup" || target.kind === "brandBlock") && actions.openCommandPalette
          ? {
              id: "obj-open-command",
              label: m.openCommandBar,
              onSelect: actions.openCommandPalette,
            }
          : null,
        placeholder("obj-dup", m.duplicatePlaceholder),
        placeholder("obj-detach", m.detachPlaceholder),
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

function hiddenWidgetsCount(desktopShell: HubDesktopShellState | null): number {
  if (!desktopShell) {
    return 0;
  }
  return desktopShell.hiddenWidgetIds.length;
}
