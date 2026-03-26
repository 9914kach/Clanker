import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@clanker/ui/components/avatar";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@clanker/ui/components/menubar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@clanker/ui/components/context-menu";
import { cn } from "@clanker/ui/lib/utils";
import { useHubAudio } from "@/components/HubAudioProvider";
import HubCommandPalette from "@/components/HubCommandPalette";
import HubDock from "@/components/HubDock";
import HubLiveTicker from "@/components/HubLiveTicker";
import { useHubToasts } from "@/components/HubToastProvider";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";
import { buildHubActions } from "@/config/hub-actions";
import { HUB_ME_TOOL, HUB_TOOLS } from "@/config/hub-tools";
import { apiUrl } from "@/config";
import type { HubLayoutContextValue, HubProfile, HubSessionState } from "@/hooks/use-hub-layout";
import { discordAvatarUrl } from "@/lib/discordCdn";

/** Text-raden i headern (rullande kompisrader). Sätt till `false` för att dölja. */
const SHOW_HUB_LIVE_TICKER = true;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export default function HubLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toasts = useHubToasts();
  const { colorPalette, setColorPalette } = useTheme();
  const { enabled: audioEnabled, toggleEnabled: toggleAudio, play } = useHubAudio();
  const [me, setMe] = useState<HubSessionState>({ status: "loading" });
  const [isCompact, setIsCompact] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const lastCommandTriggerRef = useRef<HTMLElement | null>(null);
  const leaderTimeoutRef = useRef<number | null>(null);
  const awaitingLeaderRef = useRef(false);

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
    const threshold = 28;

    const onScroll = () => {
      setIsCompact(window.scrollY > threshold);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
  const isDashboardRoute = pathname === "/dashboard";
  const shellWidthClassName = isDashboardRoute ? "max-w-[96rem]" : "max-w-6xl";

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

      if (event.repeat || isTypingTarget(event.target)) {
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

  const contextValue = useMemo<HubLayoutContextValue>(
    () => ({
      me,
      logout,
      refreshMe,
      openCommandPalette: () => openCommandPalette(),
    }),
    [logout, me, openCommandPalette, refreshMe],
  );

  const actions = useMemo(
    () =>
      buildHubActions({
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
      }),
    [
      audioEnabled,
      colorPalette,
      logout,
      navigate,
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

  const menuClassName =
    "h-auto min-w-max gap-1 border-0 bg-transparent p-0 shadow-none";

  const linkClassName = (isActive: boolean) =>
    cn(
      "inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted",
      isActive && "bg-muted",
    );

  const renderIdentity = (compact: boolean) =>
    me.status === "user" ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <NavLink
              to={profilePath!}
              className={cn(
                "flex items-center rounded-lg transition-colors duration-150 hover:bg-muted",
                compact ? "gap-2 px-1.5 py-1" : "gap-2 px-2 py-1",
              )}
              title="Right-click for system options."
            >
              <Avatar size={compact ? "default" : "lg"}>
                <AvatarImage
                  src={discordAvatarUrl(me.profile.id, me.profile.avatar, 64)}
                  alt=""
                />
                <AvatarFallback>
                  {(displayName ?? me.profile.username).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={cn("min-w-0 flex-col", compact ? "hidden lg:flex" : "hidden md:flex")}>
                <span className="truncate text-sm font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  @{me.profile.username}
                </span>
              </div>
            </NavLink>
          </ContextMenuTrigger>

          <ContextMenuContent>
            <ContextMenuLabel>Identity</ContextMenuLabel>
            <ContextMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(me.profile.id);
                toasts.push({ kind: "info", title: "Copied", message: `Discord ID: ${me.profile.id}` });
              }}
            >
              Copy Discord ID
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(`@${me.profile.username}`);
                toasts.push({ kind: "info", title: "Copied", message: `@${me.profile.username}` });
              }}
            >
              Copy handle
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => navigate(profilePath!)}>Open profile</ContextMenuItem>
            <ContextMenuItem onSelect={() => navigate("/profile/settings")}>Open settings</ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                play("panel");
                openCommandPalette();
              }}
            >
              Open command bar
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={logout}>
              Log out
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <div className="hidden text-sm text-muted-foreground md:block">
          {me.status === "loading"
            ? "Laddar konto…"
            : me.status === "backend_error"
              ? "Backendproblem"
              : "Inte inloggad"}
        </div>
      );

  /** Utan live-ticker ska titelraden inte döljas vid scroll — annars försvinner "Discord hub" helt. */
  const collapseTitleRowOnScroll = isCompact && SHOW_HUB_LIVE_TICKER;
  const tuckNavUnderCollapsedTitle = isCompact && SHOW_HUB_LIVE_TICKER;

  const renderActions = (compact: boolean) => (
    <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
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
        {compact ? "Cmd" : "Command"}
      </Button>
      <ModeToggle />
      {me.status === "user" ? (
        <Button type="button" variant="outline" size="sm" onClick={logout}>
          Logga ut
        </Button>
      ) : (
        <Button asChild size="sm">
          <Link to="/login">Logga in</Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div
          className={cn(
            "mx-auto px-5 transition-[padding] duration-300",
            shellWidthClassName,
            isCompact ? "py-2" : "py-3",
          )}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
            <div
              className={cn(
                "col-start-1 row-start-1 overflow-hidden pr-4 transition-[max-height,opacity,transform,margin] duration-300 ease-out",
                collapseTitleRowOnScroll
                  ? "pointer-events-none -translate-y-2 opacity-0 max-h-0 mb-0"
                  : cn(
                      "translate-y-0 opacity-100 max-h-16",
                      isCompact ? "mb-1" : "mb-2",
                    ),
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Link to="/dashboard" className="truncate text-lg font-semibold tracking-tight">
                  Discord hub
                </Link>
                {SHOW_HUB_LIVE_TICKER ? (
                  <div className="hidden min-w-0 max-w-[min(100%,34rem)] flex-1 md:block">
                    <HubLiveTicker variant="top" />
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={cn(
                "col-start-2 row-span-2 row-start-1 flex flex-wrap items-center justify-end self-start transition-[gap,transform] duration-300 ease-out",
                isCompact ? "gap-1.5 translate-y-0.5" : "gap-2 translate-y-0",
              )}
            >
              {renderIdentity(isCompact)}
              {renderActions(isCompact)}
            </div>

            <div
              className={cn(
                "col-start-1 row-start-2 overflow-hidden transition-[transform,padding] duration-300 ease-out",
                tuckNavUnderCollapsedTitle ? "-translate-y-1 pb-0" : "translate-y-0 pb-1",
              )}
            >
              <div className="flex min-w-0 items-center gap-3 pr-1">
                <Menubar className={menuClassName}>
                  <MenubarMenu>
                    <MenubarTrigger asChild>
                      <NavLink
                        to="/dashboard"
                        end
                        className={({ isActive }) => linkClassName(isActive)}
                      >
                        Hem
                      </NavLink>
                    </MenubarTrigger>
                  </MenubarMenu>

                  <MenubarMenu>
                    {profilePath ? (
                      <MenubarTrigger asChild>
                        <NavLink
                          to={profilePath}
                          className={({ isActive }) => linkClassName(isActive)}
                        >
                          Min profil
                        </NavLink>
                      </MenubarTrigger>
                    ) : (
                      <MenubarTrigger className="cursor-not-allowed text-muted-foreground opacity-60">
                        Min profil
                      </MenubarTrigger>
                    )}
                  </MenubarMenu>

                  <MenubarMenu>
                    {me.status === "user" ? (
                      <MenubarTrigger asChild>
                        <NavLink
                          to="/profile/settings#league"
                          className={({ isActive }) => linkClassName(isActive)}
                        >
                          League
                        </NavLink>
                      </MenubarTrigger>
                    ) : (
                      <MenubarTrigger className="cursor-not-allowed text-muted-foreground opacity-60">
                        League
                      </MenubarTrigger>
                    )}
                  </MenubarMenu>

                  <MenubarMenu>
                    <MenubarTrigger>Tools</MenubarTrigger>
                    <MenubarContent>
                      {HUB_TOOLS.map((tool) => (
                        <MenubarItem key={tool.id} asChild>
                          <Link to={tool.path}>{tool.label}</Link>
                        </MenubarItem>
                      ))}
                      {profilePath ? (
                        <MenubarItem asChild>
                          <Link to={profilePath}>Me</Link>
                        </MenubarItem>
                      ) : (
                        <MenubarItem disabled>Me</MenubarItem>
                      )}
                      <MenubarItem disabled>More modules soon. Probably.</MenubarItem>
                    </MenubarContent>
                  </MenubarMenu>
                </Menubar>

                <div
                  className={cn(
                    "hidden h-px overflow-hidden bg-border/50 md:block transition-[max-width,opacity] duration-300 ease-out",
                    isCompact ? "pointer-events-none max-w-0 flex-none opacity-0" : "max-w-none flex-1 opacity-100",
                  )}
                  aria-hidden="true"
                />

                {SHOW_HUB_LIVE_TICKER ? (
                  <div
                    className={cn(
                      "hidden items-center gap-3 overflow-hidden md:flex transition-[max-width,opacity,transform] duration-300 ease-out",
                      isCompact
                        ? "max-w-[24rem] flex-1 translate-y-0 opacity-100"
                        : "pointer-events-none max-w-0 flex-none translate-y-1 opacity-0",
                    )}
                    aria-hidden={isCompact ? undefined : true}
                  >
                    <div className="min-w-0 flex-1">
                      <HubLiveTicker variant="compact" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto flex w-full flex-col gap-6 px-5 py-8 pb-28", shellWidthClassName)}>
        <Outlet context={contextValue} />
      </main>

      <HubDock
        tools={HUB_TOOLS}
        meTool={
          profilePath
            ? {
                ...HUB_ME_TOOL,
                path: profilePath,
              }
            : null
        }
      />
      <HubCommandPalette
        open={commandOpen}
        onOpenChange={handleCommandOpenChange}
        actions={actions}
      />
    </div>
  );
}
