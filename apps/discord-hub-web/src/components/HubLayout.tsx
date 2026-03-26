import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Command, Inspect, LayoutGrid, SearchIcon, Settings2 } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@clanker/ui/components/avatar";
import { cn } from "@clanker/ui/lib/utils";
import { useHubAudio } from "@/components/HubAudioProvider";
import HubCommandPalette from "@/components/HubCommandPalette";
import HubDock from "@/components/HubDock";
import HubGlobalContextMenu from "@/components/HubGlobalContextMenu";
import HubShellObject from "@/components/HubShellObject";
import HubLiveTicker from "@/components/HubLiveTicker";
import { useHubToasts } from "@/components/HubToastProvider";
import { useHubLocale } from "@/components/locale-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";
import { buildHubActions, createHubActionApi, type HubAction } from "@/config/hub-actions";
import { HUB_TOOLS, localizeHubTools, localizeMeTool, type HubTool } from "@/config/hub-tools";
import { apiUrl } from "@/config";
import type {
  HubDesktopShellState,
  HubLayoutContextValue,
  HubProfile,
  HubSessionState,
} from "@/hooks/use-hub-layout";
import type { HubCopy } from "@/i18n/hub-copy";
import { discordAvatarUrl } from "@/lib/discordCdn";
import { hubContextData, isTextEditingTarget, resolveHubContextTarget, type HubContextTarget } from "@/lib/hub-shell-context";
import { buildHubShellMenu } from "@/lib/hub-shell-menu";
import HubNavBookmarkDialog from "@/components/HubNavBookmarkDialog";
import HubPrefsPanel from "@/components/HubPrefsPanel";
import HubShellInspectCursor from "@/components/HubShellInspectCursor";
import { useHubPrefs } from "@/components/HubPrefsProvider";
import { HubShellReorderablePrimaryNav } from "@/components/HubShellReorderableChrome";
import {
  createBookmarkNavId,
  loadNavBookmarks,
  loadPrimaryNavOrder,
  saveNavBookmarks,
  type HubNavBookmark,
} from "@/lib/hub-nav-bookmarks";
import { normalizeNavBookmarkIconKey, type HubNavBookmarkIconKey } from "@/lib/hub-nav-bookmark-icons";
import { HUB_PRIMARY_NAV_ORDER_KEY, saveOrder } from "@/lib/hub-shell-layout-order";

/** Text-raden i headern (rullande kompisrader). Sätt till `false` för att dölja. */
const SHOW_HUB_LIVE_TICKER = true;
const DOCK_STORAGE_KEY = "hub.dock.pins.v1";
const LAYOUT_EDIT_KEY = "hub.shell.layoutEdit.v1";
const GRID_SNAP_KEY = "hub.shell.gridSnap.v1";
const NATIVE_BROWSER_CONTEXT_KEY = "hub.dev.native-browser-context.v1";

function readNativeBrowserContextMenu(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  try {
    return localStorage.getItem(NATIVE_BROWSER_CONTEXT_KEY) === "true";
  } catch {
    return false;
  }
}

function readGridSnapEnabled(): boolean {
  try {
    return localStorage.getItem(GRID_SNAP_KEY) === "true";
  } catch {
    return false;
  }
}

function readLayoutEditMode(): boolean {
  try {
    return localStorage.getItem(LAYOUT_EDIT_KEY) === "true";
  } catch {
    return false;
  }
}

function loadPins(defaultPins: string[]): string[] {
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY);
    if (!raw) return defaultPins;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultPins;
    const pins = parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return pins.length > 0 ? pins : defaultPins;
  } catch {
    return defaultPins;
  }
}

function workspaceMeta(
  pathname: string,
  panel: HubCopy["chrome"],
): { id: string; label: string; detail: string } {
  if (pathname.startsWith("/tools/spin-the-wheel")) {
    return { id: "panel-wheel", label: panel.panelWheel.label, detail: panel.panelWheel.detail };
  }

  if (pathname.startsWith("/profile/settings")) {
    return {
      id: "panel-settings",
      label: panel.panelSettings.label,
      detail: panel.panelSettings.detail,
    };
  }

  if (pathname.startsWith("/u/")) {
    return {
      id: "panel-profile",
      label: panel.panelProfile.label,
      detail: panel.panelProfile.detail,
    };
  }

  return {
    id: "panel-workspace",
    label: panel.panelDefault.label,
    detail: panel.panelDefault.detail,
  };
}

export default function HubLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { copy } = useHubLocale();
  const toasts = useHubToasts();
  const { colorPalette, setColorPalette } = useTheme();
  const { enabled: audioEnabled, toggleEnabled: toggleAudio, play } = useHubAudio();
  const [me, setMe] = useState<HubSessionState>({ status: "loading" });
  const [commandOpen, setCommandOpen] = useState(false);
  const [desktopShellState, setDesktopShellState] = useState<HubDesktopShellState | null>(null);
  const [layoutEditMode, setLayoutEditMode] = useState(readLayoutEditMode);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(readGridSnapEnabled);
  const [nativeBrowserContextMenu, setNativeBrowserContextMenu] = useState(readNativeBrowserContextMenu);
  const [prefsPanelOpen, setPrefsPanelOpen] = useState(false);
  const { prefs: hubPrefs } = useHubPrefs();
  const [shellContextMenu, setShellContextMenu] = useState<{
    target: HubContextTarget;
    position: { x: number; y: number };
  } | null>(null);
  const lastCommandTriggerRef = useRef<HTMLElement | null>(null);
  const leaderTimeoutRef = useRef<number | null>(null);
  const awaitingLeaderRef = useRef(false);
  const isDashboardRoute = pathname === "/dashboard";
  const inspectCursorActive = import.meta.env.DEV && nativeBrowserContextMenu;
  const panelMeta = workspaceMeta(pathname, copy.chrome);
  const defaultPinnedIds = useMemo(() => HUB_TOOLS.map((tool) => tool.id), []);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPins(defaultPinnedIds));
  const [navBookmarks, setNavBookmarks] = useState<Record<string, HubNavBookmark>>(() => loadNavBookmarks());
  const [primaryNavOrder, setPrimaryNavOrder] = useState<string[]>(() =>
    loadPrimaryNavOrder(loadNavBookmarks()),
  );
  const [bookmarkDialog, setBookmarkDialog] = useState<null | { mode: "add" } | { mode: "edit"; id: string }>(
    null,
  );

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as HubProfile;
        setMe({ status: "user", profile: data });
      } else if (res.status === 401) {
        setMe({ status: "guest" });
      } else {
        setMe({ status: "backend_error" });
      }
    } catch {
      setMe({ status: "backend_error" });
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (me.status !== "backend_error") {
      return;
    }

    const retryTimer = window.setInterval(() => {
      void refreshMe();
    }, 5000);

    return () => window.clearInterval(retryTimer);
  }, [me.status, refreshMe]);

  useEffect(() => {
    localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  useEffect(() => {
    saveOrder(HUB_PRIMARY_NAV_ORDER_KEY, primaryNavOrder);
  }, [primaryNavOrder]);

  useEffect(() => {
    saveNavBookmarks(navBookmarks);
  }, [navBookmarks]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_EDIT_KEY, layoutEditMode ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [layoutEditMode]);

  useEffect(() => {
    try {
      localStorage.setItem(GRID_SNAP_KEY, gridSnapEnabled ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [gridSnapEnabled]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    try {
      localStorage.setItem(NATIVE_BROWSER_CONTEXT_KEY, nativeBrowserContextMenu ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [nativeBrowserContextMenu]);

  /** På <html>: HubLayout rot täcker inte ToastProvider m.m. — annars cursor:none bara delvis och pekaren känns omvänd. */
  useEffect(() => {
    if (!inspectCursorActive) {
      document.documentElement.classList.remove("hub-shell-inspect-cursor-active");
      return;
    }
    document.documentElement.classList.add("hub-shell-inspect-cursor-active");
    return () => {
      document.documentElement.classList.remove("hub-shell-inspect-cursor-active");
    };
  }, [inspectCursorActive]);

  const toggleLayoutEditMode = useCallback(() => {
    setLayoutEditMode((prev) => !prev);
    play("panel");
  }, [play]);

  const toggleGridSnap = useCallback(() => {
    setGridSnapEnabled((prev) => !prev);
    play("panel");
  }, [play]);

  const doneLayoutEdit = useCallback(() => {
    desktopShellState?.saveLayoutCommitted();
    setLayoutEditMode(false);
    play("panel");
  }, [desktopShellState, play]);

  const cancelLayoutEdit = useCallback(() => {
    desktopShellState?.discardLayoutDraft();
    setLayoutEditMode(false);
    play("panel");
  }, [desktopShellState, play]);

  const removeNavBookmark = useCallback(
    (bookmarkId: string) => {
      setShellContextMenu(null);
      setPrimaryNavOrder((p) => p.filter((x) => x !== bookmarkId));
      setNavBookmarks((b) => {
        const n = { ...b };
        delete n[bookmarkId];
        return n;
      });
      toasts.push({ kind: "info", title: copy.navBookmarks.toastRemoved });
      play("panel");
    },
    [copy.navBookmarks.toastRemoved, play, toasts],
  );

  const commitNavBookmark = useCallback(
    (payload: { bookmarkId?: string; label: string; path: string; iconKey: HubNavBookmarkIconKey }) => {
      const label = payload.label.trim();
      const path = payload.path.trim();
      const iconKey = normalizeNavBookmarkIconKey(payload.iconKey);
      if (!label || !path) {
        toasts.push({ kind: "info", title: copy.navBookmarks.validationBoth });
        return;
      }
      setShellContextMenu(null);
      if (payload.bookmarkId) {
        setNavBookmarks((b) => ({
          ...b,
          [payload.bookmarkId!]: { label, path, iconKey },
        }));
        toasts.push({ kind: "success", title: copy.navBookmarks.toastUpdated });
        play("confirm");
      } else {
        const id = createBookmarkNavId();
        setNavBookmarks((b) => ({ ...b, [id]: { label, path, iconKey } }));
        setPrimaryNavOrder((p) => [...p, id]);
        toasts.push({ kind: "success", title: copy.navBookmarks.toastAdded });
        play("confirm");
      }
      setBookmarkDialog(null);
    },
    [
      copy.navBookmarks.toastAdded,
      copy.navBookmarks.toastUpdated,
      copy.navBookmarks.validationBoth,
      play,
      toasts,
    ],
  );

  const openNavBookmarkAdd = useCallback(() => {
    setShellContextMenu(null);
    setBookmarkDialog({ mode: "add" });
    play("panel");
  }, [play]);

  const openNavBookmarkEdit = useCallback((bookmarkId: string) => {
    setShellContextMenu(null);
    setBookmarkDialog({ mode: "edit", id: bookmarkId });
    play("panel");
  }, [play]);

  const deleteNavBookmarkFromDialog = useCallback(() => {
    if (bookmarkDialog?.mode !== "edit") {
      return;
    }
    removeNavBookmark(bookmarkDialog.id);
    setBookmarkDialog(null);
  }, [bookmarkDialog, removeNavBookmark]);

  const logout = useCallback(async () => {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    setMe({ status: "guest" });
    navigate("/login", { replace: true });
  }, [navigate]);

  const displayName = me.status === "user" ? me.profile.global_name ?? me.profile.username : null;
  const profilePath =
    me.status === "user" ? `/u/${encodeURIComponent(me.profile.id)}` : null;
  const profileId = me.status === "user" ? me.profile.id : null;
  const profileHandle = me.status === "user" ? `@${me.profile.username}` : null;

  const openCommandPalette = useCallback((trigger?: EventTarget | null) => {
    const fallback =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    lastCommandTriggerRef.current = trigger instanceof HTMLElement ? trigger : fallback;
    setCommandOpen(true);
  }, []);

  const handleCommandOpenChange = useCallback((nextOpen: boolean) => {
    setCommandOpen(nextOpen);
    if (!nextOpen) {
      window.setTimeout(() => {
        lastCommandTriggerRef.current?.focus();
      }, 0);
    }
  }, []);

  useEffect(() => {
    if (!layoutEditMode) return;
    setPrefsPanelOpen(false);
    if (commandOpen) {
      handleCommandOpenChange(false);
    }
  }, [layoutEditMode, commandOpen, handleCommandOpenChange]);

  useEffect(() => {
    if (!layoutEditMode) {
      setBookmarkDialog(null);
    }
  }, [layoutEditMode]);

  useEffect(() => {
    const clearLeader = () => {
      awaitingLeaderRef.current = false;
      if (leaderTimeoutRef.current) {
        window.clearTimeout(leaderTimeoutRef.current);
        leaderTimeoutRef.current = null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (layoutEditMode) {
          if (commandOpen) {
            handleCommandOpenChange(false);
          }
          return;
        }
        if (commandOpen) {
          handleCommandOpenChange(false);
        } else {
          openCommandPalette(document.activeElement);
        }
        return;
      }

      if (commandOpen) {
        return;
      }

      const ds = desktopShellState;
      const onDashboard = pathname === "/dashboard";
      if (layoutEditMode && onDashboard && ds && !isTextEditingTarget(event.target)) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            ds.redoLayout();
          } else {
            ds.undoLayout();
          }
          play("panel");
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          ds.redoLayout();
          play("panel");
          return;
        }
        if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat) {
          if (event.key === "Escape") {
            event.preventDefault();
            if (ds.selectedWidgetIds.length > 0) {
              ds.clearWidgetSelection();
              play("panel");
            }
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            ds.nudgeSelectedWidgets(-1, 0);
            play("panel");
            return;
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            ds.nudgeSelectedWidgets(1, 0);
            play("panel");
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            ds.nudgeSelectedWidgets(0, -1);
            play("panel");
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            ds.nudgeSelectedWidgets(0, 1);
            play("panel");
            return;
          }
          if (event.key === "]") {
            event.preventDefault();
            ds.bringSelectedWidgetsToFront();
            play("panel");
            return;
          }
        }
      }

      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.repeat || isTextEditingTarget(event.target)) {
        clearLeader();
        return;
      }

      const key = event.key.toLowerCase();

      if (!layoutEditMode) {
        if (awaitingLeaderRef.current) {
          clearLeader();
          if (key === "d") {
            event.preventDefault();
            play("dock");
            navigate("/dashboard");
            return;
          }
          if (key === "w") {
            event.preventDefault();
            play("dock");
            navigate("/tools/spin-the-wheel");
            return;
          }
          if (key === "s") {
            event.preventDefault();
            play("dock");
            navigate("/profile/settings");
            return;
          }
        }

        if (key === "g") {
          awaitingLeaderRef.current = true;
          if (leaderTimeoutRef.current) {
            window.clearTimeout(leaderTimeoutRef.current);
          }
          leaderTimeoutRef.current = window.setTimeout(() => {
            awaitingLeaderRef.current = false;
            leaderTimeoutRef.current = null;
          }, 1000);
        }
      } else {
        clearLeader();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearLeader();
    };
  }, [
    commandOpen,
    desktopShellState,
    handleCommandOpenChange,
    layoutEditMode,
    navigate,
    openCommandPalette,
    pathname,
    play,
  ]);

  const localizedHubToolList = useMemo(() => localizeHubTools(copy), [copy]);

  const orderedDockTools = useMemo(() => {
    const byId = new Map(localizedHubToolList.map((tool) => [tool.id, tool] as const));
    const ordered = pinnedIds.map((id) => byId.get(id)).filter((tool): tool is HubTool => Boolean(tool));
    const seen = new Set(ordered.map((tool) => tool.id));
    for (const tool of localizedHubToolList) {
      if (!seen.has(tool.id)) {
        ordered.push(tool);
      }
    }
    return ordered;
  }, [localizedHubToolList, pinnedIds]);

  const toggleDockPin = useCallback((toolId: string) => {
    setPinnedIds((prev) => {
      if (prev.includes(toolId)) {
        const next = prev.filter((id) => id !== toolId);
        return next.length > 0 ? next : prev;
      }

      return [toolId, ...prev];
    });
  }, []);

  const contextValue = useMemo<HubLayoutContextValue>(
    () => ({
      me,
      logout,
      refreshMe,
      openCommandPalette: () => openCommandPalette(),
      setDesktopShellState,
      layoutEditMode,
      setLayoutEditMode,
      toggleLayoutEditMode,
      gridSnapEnabled,
      setGridSnapEnabled,
      toggleGridSnap,
    }),
    [gridSnapEnabled, layoutEditMode, logout, me, openCommandPalette, refreshMe, toggleGridSnap, toggleLayoutEditMode],
  );

  const actionEnvironment = useMemo(
    () => ({
      copy,
      profilePath,
      profileId,
      profileHandle,
      navigate,
      refreshSession: refreshMe,
      logout,
      colorPalette,
      setColorPalette,
      audioEnabled,
      toggleAudio,
      play,
      notify: toasts.push,
      openCommandPalette: () => openCommandPalette(),
    }),
    [
      audioEnabled,
      colorPalette,
      copy,
      logout,
      navigate,
      openCommandPalette,
      play,
      profileHandle,
      profileId,
      profilePath,
      refreshMe,
      setColorPalette,
      toasts.push,
      toggleAudio,
    ],
  );

  const actionApi = useMemo(() => createHubActionApi(actionEnvironment), [actionEnvironment]);
  const baseActions = useMemo(() => buildHubActions(actionEnvironment), [actionEnvironment]);

  const navButtonClassName = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-medium transition",
      "border-border/60 bg-background/45 hover:bg-muted/65 hover:text-foreground",
      isActive && "border-primary/40 bg-primary/12 text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_12%,transparent)]",
    );

  /** Kompakt topbar — matchar ungefär halv tidigare vertikal höjd. */
  const hubTopbarButtonClass =
    "h-7 min-h-7 gap-1 px-2 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5";

  const normalizeContextTarget = useCallback(
    (target: HubContextTarget): HubContextTarget => {
      if (target.type !== "profile") {
        return target;
      }

      const ownProfile =
        (profileId && target.profileId === profileId) ||
        (profilePath && target.profilePath === profilePath);

      return {
        ...target,
        isOwnProfile: Boolean(ownProfile),
      };
    },
    [profileId, profilePath],
  );

  const closeShellContextMenu = useCallback(() => {
    setShellContextMenu(null);
  }, []);

  const toggleDevNativeContextMenu = useCallback(() => {
    closeShellContextMenu();
    play("panel");
    const next = !nativeBrowserContextMenu;
    setNativeBrowserContextMenu(next);
    const t = copy.actions.toasts;
    toasts.push({
      kind: "info",
      title: next ? t.devNativeContextBrowserTitle : t.devNativeContextShellTitle,
      message: next ? t.devNativeContextBrowserMessage : t.devNativeContextShellMessage,
    });
  }, [
    closeShellContextMenu,
    copy.actions.toasts,
    nativeBrowserContextMenu,
    play,
    toasts,
  ]);

  const actions = useMemo((): HubAction[] => {
    if (!import.meta.env.DEV) {
      return baseActions;
    }
    const d = copy.actions;
    const devKeywords = [...d.devNativeBrowserMenu.keywords, ...d.devShellContextMenu.keywords] as readonly string[];
    return [
      ...baseActions,
      {
        id: "dev-toggle-native-context",
        label: nativeBrowserContextMenu ? d.devShellContextMenu.label : d.devNativeBrowserMenu.label,
        description: nativeBrowserContextMenu ? d.devShellContextMenu.description : d.devNativeBrowserMenu.description,
        section: "System",
        tone: "useful",
        keywords: devKeywords,
        icon: Inspect,
        onSelect: toggleDevNativeContextMenu,
      },
    ];
  }, [baseActions, copy.actions, nativeBrowserContextMenu, toggleDevNativeContextMenu]);

  const openShellContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (nativeBrowserContextMenu) {
        closeShellContextMenu();
        return;
      }

      if (event.defaultPrevented || isTextEditingTarget(event.target)) {
        closeShellContextMenu();
        return;
      }

      event.preventDefault();
      const native = event.nativeEvent;
      const atPoint =
        native instanceof MouseEvent &&
        typeof document !== "undefined" &&
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(native.clientX, native.clientY)
          : null;
      const hit = atPoint ?? event.target;
      const target = normalizeContextTarget(resolveHubContextTarget(hit));
      setShellContextMenu({
        target,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [closeShellContextMenu, nativeBrowserContextMenu, normalizeContextTarget],
  );

  useEffect(() => {
    closeShellContextMenu();
  }, [closeShellContextMenu, pathname]);

  const shellMenuSections = useMemo(
    () =>
      shellContextMenu
        ? buildHubShellMenu({
            copy,
            target: shellContextMenu.target,
            actions: actionApi,
            desktopShell: desktopShellState,
            toggleDockPin,
            layoutEditMode,
            toggleLayoutEditMode,
            onInfoToast: (title, message) => {
              toasts.push({ kind: "info", title, message: message ?? undefined });
            },
            gridSnapEnabled,
            toggleGridSnap,
            isDashboardRoute,
            onNavBookmarkAdd: layoutEditMode ? openNavBookmarkAdd : undefined,
            onNavBookmarkEdit: layoutEditMode ? openNavBookmarkEdit : undefined,
            onNavBookmarkDelete: layoutEditMode ? removeNavBookmark : undefined,
          })
        : [],
    [
      actionApi,
      copy,
      desktopShellState,
      gridSnapEnabled,
      isDashboardRoute,
      layoutEditMode,
      openNavBookmarkAdd,
      openNavBookmarkEdit,
      removeNavBookmark,
      shellContextMenu,
      toggleDockPin,
      toggleGridSnap,
      toggleLayoutEditMode,
      toasts,
    ],
  );

  const renderIdentity = () =>
    me.status === "user" ? (
        <NavLink
          to={profilePath!}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/45 px-2 py-1 transition hover:bg-muted/65",
            layoutEditMode && "pointer-events-none select-none",
          )}
          title={copy.chrome.identityNavHint}
          {...hubContextData({
            type: "shell.identity",
            profileId,
            profilePath,
            profileHandle,
            displayName,
          })}
        >
          <Avatar size="sm">
            <AvatarImage
              src={discordAvatarUrl(me.profile.id, me.profile.avatar, 64)}
              alt=""
            />
            <AvatarFallback>
              {(displayName ?? me.profile.username).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-col md:flex">
            <span className="truncate text-xs font-medium leading-tight">{displayName}</span>
            <span className="truncate text-[0.65rem] leading-tight text-muted-foreground">
              @{me.profile.username}
            </span>
          </div>
        </NavLink>
      ) : (
        <div className="hidden rounded-xl border border-border/60 bg-background/45 px-2 py-1 text-xs text-muted-foreground md:block">
          {me.status === "loading"
            ? copy.layout.loadingAccount
            : me.status === "backend_error"
              ? copy.common.backendProblem
              : copy.layout.notLoggedIn}
        </div>
      );

  const renderActions = () => (
    <div className="flex items-center justify-end gap-1.5">
      <div
        className={cn(
          "flex items-center gap-1.5",
          layoutEditMode && "pointer-events-none select-none",
        )}
        inert={layoutEditMode ? true : undefined}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={hubTopbarButtonClass}
          onClick={(event) => {
            play("panel");
            openCommandPalette(event.currentTarget);
          }}
        >
          <SearchIcon data-icon="inline-start" />
          {copy.common.command}
        </Button>
        <Button
          type="button"
          variant={prefsPanelOpen ? "secondary" : "outline"}
          size="sm"
          className={hubTopbarButtonClass}
          onClick={() => {
            play("panel");
            setPrefsPanelOpen((prev) => !prev);
          }}
          title={copy.hubPrefsPanel.openButton}
        >
          <Settings2 data-icon="inline-start" />
          <span className="hidden sm:inline">{copy.hubPrefsPanel.openButton}</span>
        </Button>
        {import.meta.env.DEV ? (
          <Button
            type="button"
            variant={nativeBrowserContextMenu ? "secondary" : "outline"}
            size="sm"
            className={hubTopbarButtonClass}
            onClick={toggleDevNativeContextMenu}
            title={
              nativeBrowserContextMenu
                ? copy.chrome.devNativeContextButtonBrowser
                : copy.chrome.devNativeContextButtonShell
            }
            aria-label={
              nativeBrowserContextMenu
                ? copy.chrome.devNativeContextButtonBrowser
                : copy.chrome.devNativeContextButtonShell
            }
          >
            <Inspect className="size-3.5" />
          </Button>
        ) : null}
        <ModeToggle triggerClassName="size-7 rounded-md [&_svg]:size-3.5" />
        {me.status === "user" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={hubTopbarButtonClass}
            onClick={logout}
          >
            {copy.common.logOut}
          </Button>
        ) : (
          <Button asChild size="sm" className={hubTopbarButtonClass}>
            <Link to="/login">{copy.common.logIn}</Link>
          </Button>
        )}
      </div>
      <Button
        type="button"
        variant={layoutEditMode ? "default" : "outline"}
        size="sm"
        className={hubTopbarButtonClass}
        onClick={toggleLayoutEditMode}
        title={layoutEditMode ? copy.chrome.layoutEditExit : copy.chrome.layoutEditEnter}
      >
        <LayoutGrid data-icon="inline-start" />
        {layoutEditMode ? copy.chrome.layoutEditExit : copy.chrome.layoutEditEnter}
      </Button>
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex h-dvh flex-col overflow-hidden bg-background text-foreground",
        layoutEditMode && "ring-2 ring-inset ring-primary/30",
      )}
      onContextMenu={openShellContextMenu}
    >
      <HubShellInspectCursor active={inspectCursorActive} prefs={hubPrefs.inspectCursor} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_24%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_28%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_94%,black),var(--background))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_18%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_14%,transparent)_1px,transparent_1px)] bg-[size:96px_96px] opacity-35" />

      <header
        className="relative z-20 border-b border-border/55 bg-background/45 backdrop-blur-xl supports-[backdrop-filter]:bg-background/35"
        {...hubContextData({ type: "shell.nav", area: "topbar" })}
      >
        <div className="flex flex-col gap-1.5 px-3 py-1 md:px-4 lg:flex-row lg:items-center lg:gap-2 lg:gap-y-0">
          <div className="flex flex-wrap items-center justify-between gap-2 lg:contents">
            <HubShellObject
              as="div"
              objectId="shell.brandRow"
              objectKind="brandBlock"
              label={copy.chrome.shellObjectBrandBlock}
              layoutEditMode={layoutEditMode}
              className="flex min-w-0 shrink-0 items-center gap-2 lg:order-1"
            >
              <Link
                to="/dashboard"
                tabIndex={layoutEditMode ? -1 : undefined}
                onClick={(e) => {
                  if (layoutEditMode) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border/60 bg-background/45 px-2 py-1 transition hover:bg-muted/65",
                  layoutEditMode && "pointer-events-none select-none",
                )}
                {...hubContextData({
                  type: "tool",
                  toolId: "dashboard",
                  label: copy.chrome.toolDesktop,
                  path: "/dashboard",
                  pinned: true,
                })}
              >
                <div className="rounded-lg border border-border/60 bg-primary/14 p-1 text-primary">
                  <Command className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold tracking-[0.04em] leading-tight">
                    {copy.chrome.brandTitle}
                  </div>
                  <div className="truncate text-[0.62rem] uppercase leading-tight tracking-[0.18em] text-muted-foreground">
                    {copy.chrome.brandTagline}
                  </div>
                </div>
              </Link>
            </HubShellObject>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 lg:order-4 lg:ml-auto">
              {renderIdentity()}
              {renderActions()}
            </div>
          </div>

          {SHOW_HUB_LIVE_TICKER ? (
            <div className="hidden min-w-0 flex-1 basis-0 lg:order-2 lg:flex">
              <HubLiveTicker variant="top" />
            </div>
          ) : null}

          <HubShellObject
            as="nav"
            objectId="shell.nav.primary"
            objectKind="navGroup"
            label={copy.chrome.shellObjectNavGroup}
            layoutEditMode={layoutEditMode}
            layoutEditChrome="none"
            className="flex min-w-0 shrink-0 flex-col gap-0 lg:order-3"
            aria-label={copy.chrome.shellObjectNavGroup}
          >
            <HubShellReorderablePrimaryNav
              order={primaryNavOrder}
              onReorder={setPrimaryNavOrder}
              layoutEditMode={layoutEditMode}
              play={play}
              copy={copy}
              navButtonClassName={navButtonClassName}
              profilePath={profilePath}
              profileId={profileId}
              pinnedIds={pinnedIds}
              navBookmarks={navBookmarks}
            />
          </HubShellObject>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        {isDashboardRoute ? (
          <main className="flex min-h-0 flex-1 overflow-auto pb-24">
            <Outlet context={contextValue} />
          </main>
        ) : (
          <main className="flex min-h-0 flex-1 p-3 pb-24 md:p-4">
            <HubShellObject
              as="section"
              objectId={`shell.route.${panelMeta.id}`}
              objectKind="routePanel"
              label={panelMeta.label}
              layoutEditMode={layoutEditMode}
              className="mx-auto flex min-h-0 w-full max-w-[112rem] flex-1 flex-col overflow-hidden rounded-[2rem] border border-border/65 bg-background/42 shadow-2xl backdrop-blur-xl"
              aria-label={panelMeta.label}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/55 bg-background/36 px-4 py-3 md:px-5">
                <div className="min-w-0">
                  <div className="text-[0.68rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    {copy.chrome.runningApp}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{panelMeta.label}</div>
                </div>
                <div className="text-xs text-muted-foreground">{panelMeta.detail}</div>
              </div>
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-auto px-4 py-5 md:px-5 md:py-6",
                  layoutEditMode &&
                    "[&_a]:pointer-events-none [&_button]:pointer-events-none [&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=button]]:pointer-events-none",
                )}
              >
                <Outlet context={contextValue} />
              </div>
            </HubShellObject>
          </main>
        )}
      </div>

      <HubDock
        tools={orderedDockTools}
        pinnedIds={pinnedIds}
        meTool={profilePath ? localizeMeTool(copy, profilePath) : null}
        layoutEditMode={layoutEditMode}
        dockShellLabel={copy.chrome.shellObjectDockBar}
        isDashboardRoute={isDashboardRoute}
        desktopShell={desktopShellState}
        gridSnapEnabled={gridSnapEnabled}
        onToggleGridSnap={toggleGridSnap}
        onCancelLayoutEdit={cancelLayoutEdit}
        onDoneLayoutEdit={doneLayoutEdit}
        onSaveLayoutCommitted={() => desktopShellState?.saveLayoutCommitted()}
        onDiscardLayoutDraft={() => desktopShellState?.discardLayoutDraft()}
        onUndoLayout={() => desktopShellState?.undoLayout()}
        onRedoLayout={() => desktopShellState?.redoLayout()}
        onToggleAutosaveLayout={() => desktopShellState?.toggleAutosaveLayout()}
        copy={copy}
        onDesktopOnlyAction={() => {
          toasts.push({ kind: "info", title: copy.editMode.desktopOnlyToast });
        }}
        dockPosition={hubPrefs.dock.position}
        dockScale={hubPrefs.dock.scale}
      />
      <HubCommandPalette
        open={commandOpen}
        onOpenChange={handleCommandOpenChange}
        actions={actions}
      />
      <HubGlobalContextMenu
        open={Boolean(shellContextMenu)}
        position={shellContextMenu?.position ?? { x: 0, y: 0 }}
        sections={shellMenuSections}
        onClose={closeShellContextMenu}
      />
      <HubNavBookmarkDialog
        open={bookmarkDialog !== null}
        mode={bookmarkDialog?.mode === "edit" ? "edit" : "add"}
        initialBookmarkId={bookmarkDialog?.mode === "edit" ? bookmarkDialog.id : null}
        initialLabel={
          bookmarkDialog?.mode === "edit" ? (navBookmarks[bookmarkDialog.id]?.label ?? "") : ""
        }
        initialPath={
          bookmarkDialog?.mode === "edit" ? (navBookmarks[bookmarkDialog.id]?.path ?? "") : ""
        }
        initialIconKey={
          bookmarkDialog?.mode === "edit"
            ? normalizeNavBookmarkIconKey(navBookmarks[bookmarkDialog.id]?.iconKey)
            : "Bookmark"
        }
        copy={copy.navBookmarks}
        onOpenChange={(next) => {
          if (!next) {
            setBookmarkDialog(null);
          }
        }}
        onCommit={commitNavBookmark}
        onDelete={bookmarkDialog?.mode === "edit" ? deleteNavBookmarkFromDialog : undefined}
      />
      <HubPrefsPanel
        open={prefsPanelOpen}
        onClose={() => setPrefsPanelOpen(false)}
        widgets={desktopShellState?.widgets ?? []}
      />
    </div>
  );
}
