import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
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
import { Separator } from "@clanker/ui/components/separator";
import { cn } from "@clanker/ui/lib/utils";
import HubLiveTicker from "@/components/HubLiveTicker";
import { ModeToggle } from "@/components/mode-toggle";
import { apiUrl } from "@/config";
import type { HubLayoutContextValue, HubProfile, HubSessionState } from "@/hooks/use-hub-layout";
import { discordAvatarUrl } from "@/lib/discordCdn";

/** Text-raden i headern (rullande kompisrader). Sätt till `false` för att dölja. */
const SHOW_HUB_LIVE_TICKER = true;

export default function HubLayout() {
  const navigate = useNavigate();
  const [me, setMe] = useState<HubSessionState>({ status: "loading" });
  const [isCompact, setIsCompact] = useState(false);

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

  const contextValue = useMemo<HubLayoutContextValue>(
    () => ({
      me,
      logout,
      refreshMe,
    }),
    [logout, me, refreshMe],
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
        <NavLink
          to={profilePath!}
          className={cn(
            "flex items-center rounded-lg transition-colors duration-150 hover:bg-muted",
            compact ? "gap-2 px-1.5 py-1" : "gap-2 px-2 py-1",
          )}
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
            "mx-auto max-w-6xl px-5 transition-[padding] duration-300",
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
                        Översikt
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
                    <MenubarTrigger asChild>
                      <NavLink to="/" className={({ isActive }) => linkClassName(isActive)}>
                        Hem
                      </NavLink>
                    </MenubarTrigger>
                  </MenubarMenu>

                  <MenubarMenu>
                    <MenubarTrigger>Verktyg</MenubarTrigger>
                    <MenubarContent>
                      <MenubarItem asChild>
                        <Link to="/dashboard">Hubben</Link>
                      </MenubarItem>
                      <MenubarItem asChild>
                        <Link to="/tools/spin-the-wheel">Spin the Wheel</Link>
                      </MenubarItem>
                      {profilePath ? (
                        <MenubarItem asChild>
                          <Link to={profilePath}>Publik profil</Link>
                        </MenubarItem>
                      ) : (
                        <MenubarItem disabled>Publik profil</MenubarItem>
                      )}
                      <MenubarItem disabled>Fler verktyg kommer snart</MenubarItem>
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
                    <Separator orientation="vertical" className="h-5 shrink-0" />
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

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8">
        <Outlet context={contextValue} />
      </main>
    </div>
  );
}
