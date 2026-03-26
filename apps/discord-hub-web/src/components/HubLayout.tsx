import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Command, LayoutGrid, LayoutPanelTop, SearchIcon, Workflow } from "lucide-react";
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
import { buildHubActions, createHubActionApi } from "@/config/hub-actions";
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

/** Text-raden i headern (rullande kompisrader). Sätt till `false` för att dölja. */
const SHOW_HUB_LIVE_TICKER = true;
const DOCK_STORAGE_KEY = "hub.dock.pins.v1";
const LAYOUT_EDIT_KEY = "hub.shell.layoutEdit.v1";
const GRID_SNAP_KEY = "hub.shell.gridSnap.v1";

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
  const [shellContextMenu, setShellContextMenu] = useState<{
    target: HubContextTarget;
    position: { x: number; y: number };
  } | null>(null);
  const lastCommandTriggerRef = useRef<HTMLElement | null>(null);
  const leaderTimeoutRef = useRef<number | null>(null);
  const awaitingLeaderRef = useRef(false);
  const isDashboardRoute = pathname === "/dashboard";
  const panelMeta = workspaceMeta(pathname, copy.chrome);
  const defaultPinnedIds = useMemo(() => HUB_TOOLS.map((tool) => tool.id), []);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPins(defaultPinnedIds));

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

  const toggleLayoutEditMode = useCallback(() => {
    setLayoutEditMode((prev) => !prev);
    play("panel");
  }, [play]);

  const toggleGridSnap = useCallback(() => {
    setGridSnapEnabled((prev) => !prev);
    play("panel");
  }, [play]);

  const exitLayoutEdit = useCallback(() => {
    setLayoutEditMode(false);
    play("panel");
  }, [play]);

  const saveLayoutAck = useCallback(() => {
    desktopShellState?.acknowledgeLayoutSaved();
    play("confirm");
  }, [desktopShellState, play]);

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
        if (commandOpen) {
          handleCommandOpenChange(false);
        } else {
          openCommandPalette(document.activeElement);
        }
        return;
      }

      if (commandOpen || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.repeat || isTextEditingTarget(event.target)) {
        clearLeader();
        return;
      }

      const key = event.key.toLowerCase();
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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearLeader();
    };
  }, [commandOpen, handleCommandOpenChange, navigate, openCommandPalette, play]);

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
  const actions = useMemo(() => buildHubActions(actionEnvironment), [actionEnvironment]);

  const navButtonClassName = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition",
      "border-border/60 bg-background/45 hover:bg-muted/65 hover:text-foreground",
      isActive && "border-primary/40 bg-primary/12 text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_12%,transparent)]",
    );

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

  const openShellContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      // In dev, leave the native context menu (Inspect, reload, etc.) untouched.
      if (import.meta.env.DEV) {
        closeShellContextMenu();
        return;
      }

      if (event.defaultPrevented || isTextEditingTarget(event.target)) {
        closeShellContextMenu();
        return;
      }

      event.preventDefault();
      const target = normalizeContextTarget(resolveHubContextTarget(event.target));
      setShellContextMenu({
        target,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [closeShellContextMenu, normalizeContextTarget],
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
          })
        : [],
    [
      actionApi,
      copy,
      desktopShellState,
      gridSnapEnabled,
      isDashboardRoute,
      layoutEditMode,
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
          className="flex items-center gap-2 rounded-[1.25rem] border border-border/60 bg-background/45 px-2.5 py-2 transition hover:bg-muted/65"
          title={copy.chrome.identityNavHint}
          {...hubContextData({
            type: "shell.identity",
            profileId,
            profilePath,
            profileHandle,
            displayName,
          })}
        >
          <Avatar size="default">
            <AvatarImage
              src={discordAvatarUrl(me.profile.id, me.profile.avatar, 64)}
              alt=""
            />
            <AvatarFallback>
              {(displayName ?? me.profile.username).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-col md:flex">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <span className="truncate text-xs text-muted-foreground">@{me.profile.username}</span>
          </div>
        </NavLink>
      ) : (
        <div className="hidden rounded-[1.25rem] border border-border/60 bg-background/45 px-3 py-2 text-sm text-muted-foreground md:block">
          {me.status === "loading"
            ? copy.layout.loadingAccount
            : me.status === "backend_error"
              ? copy.common.backendProblem
              : copy.layout.notLoggedIn}
        </div>
      );

  const renderActions = () => (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
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
        variant={layoutEditMode ? "default" : "outline"}
        size="sm"
        onClick={toggleLayoutEditMode}
        title={layoutEditMode ? copy.chrome.layoutEditExit : copy.chrome.layoutEditEnter}
      >
        <LayoutGrid data-icon="inline-start" />
        {layoutEditMode ? copy.chrome.layoutEditExit : copy.chrome.layoutEditEnter}
      </Button>
      <ModeToggle />
      {me.status === "user" ? (
        <Button type="button" variant="outline" size="sm" onClick={logout}>
          {copy.common.logOut}
        </Button>
      ) : (
        <Button asChild size="sm">
          <Link to="/login">{copy.common.logIn}</Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground" onContextMenu={openShellContextMenu}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_24%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_28%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_94%,black),var(--background))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_18%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_14%,transparent)_1px,transparent_1px)] bg-[size:96px_96px] opacity-35" />

      <header
        className="relative z-20 border-b border-border/55 bg-background/45 backdrop-blur-xl supports-[backdrop-filter]:bg-background/35"
        {...hubContextData({ type: "shell.nav", area: "topbar" })}
      >
        <div className="flex flex-col gap-3 px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <HubShellObject
              as="div"
              objectId="shell.brandRow"
              objectKind="brandBlock"
              label={copy.chrome.shellObjectBrandBlock}
              layoutEditMode={layoutEditMode}
              className="flex min-w-0 items-center gap-3"
            >
              <Link
                to="/dashboard"
                className="flex items-center gap-3 rounded-[1.4rem] border border-border/60 bg-background/45 px-3 py-2 transition hover:bg-muted/65"
                {...hubContextData({
                  type: "tool",
                  toolId: "dashboard",
                  label: copy.chrome.toolDesktop,
                  path: "/dashboard",
                  pinned: true,
                })}
              >
                <div className="rounded-xl border border-border/60 bg-primary/14 p-2 text-primary">
                  <Command className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold tracking-[0.04em]">{copy.chrome.brandTitle}</div>
                  <div className="truncate text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
                    {copy.chrome.brandTagline}
                  </div>
                </div>
              </Link>

              {SHOW_HUB_LIVE_TICKER ? (
                <div className="hidden min-w-0 flex-1 lg:block">
                  <HubLiveTicker variant="top" />
                </div>
              ) : null}
            </HubShellObject>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {renderIdentity()}
              {renderActions()}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <HubShellObject
              as="nav"
              objectId="shell.nav.primary"
              objectKind="navGroup"
              label={copy.chrome.shellObjectNavGroup}
              layoutEditMode={layoutEditMode}
              className="flex flex-wrap items-center gap-2"
              aria-label={copy.chrome.shellObjectNavGroup}
            >
              <NavLink
                to="/dashboard"
                end
                className={({ isActive }) => navButtonClassName(isActive)}
                {...hubContextData({
                  type: "tool",
                  toolId: "desktop",
                  label: copy.chrome.toolDesktop,
                  path: "/dashboard",
                  pinned: true,
                })}
              >
                <LayoutPanelTop className="size-4" />
                {copy.chrome.navDesktop}
              </NavLink>

              {profilePath ? (
                <NavLink
                  to={profilePath}
                  className={({ isActive }) => navButtonClassName(isActive)}
                  {...hubContextData({
                    type: "profile",
                    profileId,
                    profilePath,
                    label: copy.chrome.myProfile,
                    isOwnProfile: true,
                  })}
                >
                  {copy.chrome.myProfile}
                </NavLink>
              ) : (
                <span className={navButtonClassName(false)}>{copy.chrome.myProfileOffline}</span>
              )}

              <NavLink
                to="/profile/settings"
                className={({ isActive }) => navButtonClassName(isActive)}
                {...hubContextData({
                  type: "panel",
                  panelId: "settings",
                  panelLabel: copy.chrome.panelSettings.label,
                })}
              >
                {copy.chrome.settings}
              </NavLink>

              <NavLink
                to="/tools/spin-the-wheel"
                className={({ isActive }) => navButtonClassName(isActive)}
                {...hubContextData({
                  type: "tool",
                  toolId: "spin-the-wheel",
                  label: copy.chrome.panelWheel.label,
                  path: "/tools/spin-the-wheel",
                  pinned: pinnedIds.includes("spin-the-wheel"),
                })}
              >
                <Workflow className="size-4" />
                {copy.chrome.wheel}
              </NavLink>
            </HubShellObject>

            <HubShellObject
              as="div"
              objectId="shell.statusStrip"
              objectKind="statusStrip"
              label={copy.chrome.shellObjectStatusStrip}
              layoutEditMode={layoutEditMode}
              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1">
                {copy.chrome.paletteBadge(colorPalette)}
              </span>
              <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1">
                {copy.chrome.audioBadge(audioEnabled)}
              </span>
              <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1">
                {isDashboardRoute ? copy.chrome.desktopMode : panelMeta.label}
              </span>
            </HubShellObject>
          </div>
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
              <div className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-5 md:py-6">
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
        onExitLayoutEdit={exitLayoutEdit}
        onSaveLayout={saveLayoutAck}
        copy={copy}
        onDesktopOnlyAction={() => {
          toasts.push({ kind: "info", title: copy.editMode.desktopOnlyToast });
        }}
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
    </div>
  );
}
