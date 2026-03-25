import {
  faArrowRightFromBracket,
  faGamepad,
  faLink,
  faRotate,
  faShieldHalved,
  faTrophy,
  faUnlink,
  faUserGear,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@clanker/ui/components/navigation-menu";
import { cn } from "@clanker/ui/lib/utils";
import { apiUrl } from "@/config";
import {
  accentColorToHex,
  discordAvatarUrl,
  discordBannerUrl,
} from "@/lib/discordCdn";

type MeProfile = {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
  banner: string | null;
  accent_color: number | null;
};

type MeState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; profile: MeProfile }
  | { status: "backend_error" };

const HUB_GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";

type GuildSummaryResponse = {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    approximate_member_count: number | null;
    approximate_presence_count: number | null;
  };
  channel_count: number;
};

type GuildLiveResponse = {
  guild_id: string;
  gateway_connected: boolean;
  gateway_degraded: boolean;
  gateway_degraded_reason: string | null;
  last_event_at: string | null;
  voice_users: { user_id: string; channel_id: string | null }[];
};

type GuildWidgetData = {
  summary: GuildSummaryResponse | null;
  live: GuildLiveResponse | null;
  summaryError: string | null;
  liveError: string | null;
};

type LeagueRegion = "EUW" | "EUNE" | "NA" | "KR" | "BR";

type LeagueConnection = {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: "solo" | "flex";
  statusMessage: string;
  linkedAt: string;
  lastSyncRequestedAt: string | null;
};

type LeagueStatusResponse = {
  connected: boolean;
  connection: LeagueConnection | null;
};

type LeagueForm = {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: "solo" | "flex";
  statusMessage: string;
};

const defaultLeagueForm: LeagueForm = {
  riotId: "",
  tagLine: "",
  region: "EUW",
  autoSync: true,
  rankPreference: "solo",
  statusMessage: "Ready for ranked grind.",
};

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeState>({ status: "loading" });
  const [leagueForm, setLeagueForm] = useState<LeagueForm>(defaultLeagueForm);
  const [leagueStatus, setLeagueStatus] = useState<LeagueStatusResponse | null>(null);
  const [leagueMessage, setLeagueMessage] = useState("");
  const [leagueBusy, setLeagueBusy] = useState(false);
  const [profileSettings, setProfileSettings] = useState({
    showOnlineStatus: true,
    showRank: true,
    shareChampionPool: false,
  });
  const [guildWidget, setGuildWidget] = useState<GuildWidgetData>({
    summary: null,
    live: null,
    summaryError: null,
    liveError: null,
  });

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as MeProfile;
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

  const refreshLeague = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/integrations/league/status"), {
        credentials: "include",
      });
      if (!res.ok) {
        return;
      }

      const data = await parseJson<LeagueStatusResponse>(res);
      if (!data) {
        return;
      }

      setLeagueStatus(data);
      if (data.connection) {
        setLeagueForm({
          riotId: data.connection.riotId,
          tagLine: data.connection.tagLine,
          region: data.connection.region,
          autoSync: data.connection.autoSync,
          rankPreference: data.connection.rankPreference,
          statusMessage: data.connection.statusMessage,
        });
      }
    } catch {
      setLeagueMessage("Kunde inte läsa League-status just nu.");
    }
  }, []);

  useEffect(() => {
    void refreshMe();
    void refreshLeague();
  }, [refreshLeague, refreshMe]);

  useEffect(() => {
    if (me.status !== "user" || !HUB_GUILD_ID) {
      return;
    }
    const ac = new AbortController();

    const readError = async (res: Response): Promise<string> => {
      try {
        const j = (await res.json()) as { error?: string; code?: string };
        if (typeof j.error === "string") {
          return j.code ? `${j.error} (${j.code})` : j.error;
        }
      } catch {
        /* ignore */
      }
      return res.statusText || `HTTP ${res.status}`;
    };

    const fetchSummary = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(HUB_GUILD_ID)}/summary`),
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          const summaryError = await readError(res);
          setGuildWidget((g) => ({
            ...g,
            summary: null,
            summaryError,
          }));
          return;
        }
        const summary = (await res.json()) as GuildSummaryResponse;
        setGuildWidget((g) => ({
          ...g,
          summary,
          summaryError: null,
        }));
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          return;
        }
        setGuildWidget((g) => ({
          ...g,
          summary: null,
          summaryError: "Nätverksfel vid hämtning av summary",
        }));
      }
    };

    const fetchLive = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/live/guild/${encodeURIComponent(HUB_GUILD_ID)}`),
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          const liveError = await readError(res);
          setGuildWidget((g) => ({
            ...g,
            live: null,
            liveError,
          }));
          return;
        }
        const live = (await res.json()) as GuildLiveResponse;
        setGuildWidget((g) => ({ ...g, live, liveError: null }));
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          return;
        }
        setGuildWidget((g) => ({
          ...g,
          live: null,
          liveError: "Nätverksfel vid hämtning av live-data",
        }));
      }
    };

    void Promise.all([fetchSummary(), fetchLive()]);
    const tSummary = window.setInterval(() => void fetchSummary(), 15_000);
    const tLive = window.setInterval(() => void fetchLive(), 4_000);
    return () => {
      ac.abort();
      window.clearInterval(tSummary);
      window.clearInterval(tLive);
    };
  }, [me.status]);

  const logout = async () => {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    navigate("/login", { replace: true });
  };

  const accountHealth = useMemo(() => {
    const hasLinkedLeague = leagueStatus?.connection !== null;
    const score =
      (profileSettings.showOnlineStatus ? 30 : 0) +
      (profileSettings.showRank ? 30 : 0) +
      (hasLinkedLeague ? 40 : 0);

    if (score >= 80) return "Klar";
    if (score >= 40) return "På gång";
    return "Behöver setup";
  }, [leagueStatus?.connection, profileSettings.showOnlineStatus, profileSettings.showRank]);

  const submitLeagueConnect = async () => {
    setLeagueBusy(true);
    setLeagueMessage("");
    try {
      const res = await fetch(apiUrl("/api/integrations/league/connect"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leagueForm),
      });

      if (!res.ok) {
        const payload = await parseJson<{ error?: string }>(res);
        setLeagueMessage(payload?.error ?? "Kunde inte koppla League-kontot.");
        return;
      }

      setLeagueMessage("League-konto kopplat. Redo för framtida datainsamling.");
      await refreshLeague();
    } catch {
      setLeagueMessage("Nätverksfel vid koppling av League-konto.");
    } finally {
      setLeagueBusy(false);
    }
  };

  const submitLeagueSync = async () => {
    setLeagueBusy(true);
    setLeagueMessage("");
    try {
      const res = await fetch(apiUrl("/api/integrations/league/sync"), {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const payload = await parseJson<{ error?: string }>(res);
        setLeagueMessage(payload?.error ?? "Kunde inte köra synk.");
        return;
      }

      setLeagueMessage("Synk begärd. Nästa steg är att ansluta Riot API-data.");
      await refreshLeague();
    } catch {
      setLeagueMessage("Nätverksfel vid synk.");
    } finally {
      setLeagueBusy(false);
    }
  };

  const submitLeagueDisconnect = async () => {
    setLeagueBusy(true);
    setLeagueMessage("");
    try {
      const res = await fetch(apiUrl("/api/integrations/league/disconnect"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setLeagueMessage("Kunde inte koppla bort League-kontot.");
        return;
      }

      setLeagueMessage("League-konto bortkopplat.");
      await refreshLeague();
    } catch {
      setLeagueMessage("Nätverksfel vid bortkoppling.");
    } finally {
      setLeagueBusy(false);
    }
  };

  if (me.status === "loading") {
    return <div className="mx-auto max-w-4xl px-5 py-10 text-muted-foreground">Laddar profil…</div>;
  }
  if (me.status === "guest") {
    return <Navigate to="/login" replace />;
  }
  if (me.status === "backend_error") {
    return (
      <div className="mx-auto max-w-lg px-5 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Backend nårs inte</CardTitle>
            <CardDescription>
              <code className="text-foreground">discord-hub-api</code> körs inte eller har avslutats
              (t.ex. saknade miljövariabler).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Kontrollera att API:t körs.</p>
            <p>
              Öppna terminalen där du kör dev-stacken och läs fliken{" "}
              <code className="text-foreground">[api]</code>. Lägg till värden från{" "}
              <code className="text-foreground">apps/discord-hub-api/.env.example</code> i repots{" "}
              <code className="text-foreground">.env</code>, starta om sedan{" "}
              <code className="text-foreground">clanker dev discord</code> eller{" "}
              <code className="text-foreground">npm run dev:discord-stack</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile } = me;
  const displayName = profile.global_name ?? profile.username;
  const accentCoverStyle: CSSProperties | undefined =
    !profile.banner && profile.accent_color !== null
      ? { backgroundColor: accentColorToHex(profile.accent_color) }
      : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <section className="relative">
        <Card className="gap-0 overflow-hidden p-0 shadow-sm">
          <div className="relative min-h-[132px] overflow-hidden rounded-t-xl">
            <div
              className={`absolute inset-0 ${profile.banner || profile.accent_color !== null ? "" : "bg-muted"}`}
              style={accentCoverStyle}
            >
              {profile.banner ? (
                <img
                  src={discordBannerUrl(profile.id, profile.banner)}
                  alt=""
                  className="h-full w-full object-cover"
                  decoding="async"
                />
              ) : null}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80" aria-hidden />

            <motion.div
              className="relative z-10 flex min-h-[132px] flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-6 sm:px-6"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="flex min-w-0 items-center gap-4">
                <img
                  src={discordAvatarUrl(profile.id, profile.avatar, 128)}
                  alt={displayName}
                  width={112}
                  height={112}
                  className="size-24 shrink-0 rounded-full object-cover shadow-lg ring-4 ring-white/30 sm:size-28"
                  decoding="async"
                />
                <div className="flex min-w-0 flex-col gap-1 pb-1">
                  <p className="truncate text-2xl font-semibold tracking-tight text-white">{displayName}</p>
                  <p className="truncate font-mono text-sm text-white/80">@{profile.username}</p>
                  <p className="text-xs text-white/70">Profilstatus: {accountHealth}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/15 hover:text-white"
                aria-label="Logga ut"
                onClick={logout}
              >
                <FontAwesomeIcon icon={faArrowRightFromBracket} />
              </Button>
            </motion.div>
          </div>

          <div className="rounded-b-xl border-t border-border bg-card px-1 py-1 sm:px-2">
            <NavigationMenu className="w-full max-w-none justify-start" viewport={false}>
              <NavigationMenuList className="w-full flex-wrap justify-start gap-0.5 sm:gap-1">
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <NavLink
                      to="/dashboard"
                      end
                      className={({ isActive }) =>
                        cn(navigationMenuTriggerStyle(), isActive && "bg-muted")
                      }
                    >
                      Översikt
                    </NavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <NavLink
                      to="/"
                      className={({ isActive }) =>
                        cn(navigationMenuTriggerStyle(), isActive && "bg-muted")
                      }
                    >
                      Hem
                    </NavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Verktyg</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[min(100vw-2rem,280px)] gap-1 p-2 sm:w-80">
                      <li>
                        <NavigationMenuLink asChild>
                          <NavLink
                            to="/dashboard"
                            className={({ isActive }) => cn("block w-full", isActive && "bg-muted/70")}
                          >
                            <div className="flex flex-col gap-0.5 text-sm">
                              <span className="leading-none font-medium">Hubben</span>
                              <span className="line-clamp-2 text-muted-foreground">
                                Översikt och kommande moduler.
                              </span>
                            </div>
                          </NavLink>
                        </NavigationMenuLink>
                      </li>
                      <li
                        className="rounded-lg px-2 py-2 text-sm text-muted-foreground"
                        aria-disabled
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="leading-none font-medium text-foreground/70">Fler verktyg</span>
                          <span className="line-clamp-2">Kommer när nya routes läggs till.</span>
                        </div>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </Card>
      </section>

      <motion.header
        className=""
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <h1 className="text-3xl font-semibold tracking-tight">Discord hub</h1>
        <p className="mt-2 text-muted-foreground">Verktyg för discord-gänget — fler moduler kommer här.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-md min-w-0 flex-1 flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Diagramfärger (chart-1–5) och primärknapp följer valt färgtema i temamenyn.
            </p>
            <div
              className="ring-border flex h-2.5 overflow-hidden rounded-full ring-1"
              aria-hidden
            >
              <span className="min-w-0 flex-1 bg-chart-1" />
              <span className="min-w-0 flex-1 bg-chart-2" />
              <span className="min-w-0 flex-1 bg-chart-3" />
              <span className="min-w-0 flex-1 bg-chart-4" />
              <span className="min-w-0 flex-1 bg-chart-5" />
            </div>
          </div>
          <Button type="button" className="shrink-0">
            Primärfärg (exempel)
          </Button>
        </div>
      </motion.header>

      {me.status === "user" && HUB_GUILD_ID ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Discord-server (bot)</CardTitle>
              <CardDescription>
                REST-summary och Gateway voice-state för guild{" "}
                <code className="text-foreground">{HUB_GUILD_ID}</code>. Kräver{" "}
                <code className="text-foreground">DISCORD_BOT_TOKEN</code> och rätt allowlist i API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {guildWidget.summaryError ? (
                <p className="text-destructive">Summary: {guildWidget.summaryError}</p>
              ) : null}
              {guildWidget.liveError ? (
                <p className="text-destructive">Live: {guildWidget.liveError}</p>
              ) : null}
              {guildWidget.summary ? (
                <div className="space-y-1">
                  <p className="text-foreground font-medium">{guildWidget.summary.guild.name}</p>
                  <p>
                    Medlemmar (ca): {guildWidget.summary.guild.approximate_member_count ?? "—"} · online (ca):{" "}
                    {guildWidget.summary.guild.approximate_presence_count ?? "—"} · kanaler:{" "}
                    {guildWidget.summary.channel_count}
                  </p>
                </div>
              ) : !guildWidget.summaryError ? (
                <p>Laddar summary…</p>
              ) : null}
              {guildWidget.live ? (
                <div className="space-y-1 border-border border-t pt-3">
                  <p>
                    Gateway:{" "}
                    {guildWidget.live.gateway_connected ? (
                      <span className="text-foreground">ansluten</span>
                    ) : (
                      <span className="text-destructive">frånkopplad</span>
                    )}
                    {guildWidget.live.gateway_degraded ? (
                      <span className="text-destructive">
                        {" "}
                        · degraded
                        {guildWidget.live.gateway_degraded_reason
                          ? `: ${guildWidget.live.gateway_degraded_reason}`
                          : ""}
                      </span>
                    ) : null}
                  </p>
                  <p>
                    I voice just nu: {guildWidget.live.voice_users.length}{" "}
                    {guildWidget.live.last_event_at ? `· senaste event: ${guildWidget.live.last_event_at}` : null}
                  </p>
                </div>
              ) : !guildWidget.liveError ? (
                <p>Laddar live…</p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : me.status === "user" && !HUB_GUILD_ID ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Discord-server (bot)</CardTitle>
              <CardDescription>
                Sätt <code className="text-foreground">VITE_DISCORD_HUB_GUILD_ID</code> i{" "}
                <code className="text-foreground">.env</code> (repots rot) för att visa server-widgeten här.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faShieldHalved} /> Status
            </CardTitle>
            <CardDescription>Snabbstatus för kontot.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Discord inloggning: Aktiv</p>
            <p>League koppling: {leagueStatus?.connected ? "Aktiv" : "Inte kopplad"}</p>
            <p>Integritetsläge: {profileSettings.shareChampionPool ? "Delar champion pool" : "Privat"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faGamepad} /> Spel
            </CardTitle>
            <CardDescription>Förbered plats för speldata.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Favoritläge: Ranked</p>
            <p>Rankkälla: {leagueForm.rankPreference === "solo" ? "Solo Queue" : "Flex Queue"}</p>
            <p>Region: {leagueForm.region}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faUserGear} /> Mer profildata
            </CardTitle>
            <CardDescription>Extra datafält för framtida moduler.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Discord-ID: {profile.id}</p>
            <p>Visningsnamn: {displayName}</p>
            <p>Senaste sync: {leagueStatus?.connection?.lastSyncRequestedAt ?? "Inte körd ännu"}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inställningar</CardTitle>
            <CardDescription>Förbered grundinställningar för profilsidan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>Visa online-status</span>
              <input
                type="checkbox"
                checked={profileSettings.showOnlineStatus}
                onChange={(e) =>
                  setProfileSettings((prev) => ({ ...prev, showOnlineStatus: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>Visa rank på profil</span>
              <input
                type="checkbox"
                checked={profileSettings.showRank}
                onChange={(e) =>
                  setProfileSettings((prev) => ({ ...prev, showRank: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>Dela champion pool</span>
              <input
                type="checkbox"
                checked={profileSettings.shareChampionPool}
                onChange={(e) =>
                  setProfileSettings((prev) => ({ ...prev, shareChampionPool: e.target.checked }))
                }
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FontAwesomeIcon icon={faLink} /> Synka League of Legends
            </CardTitle>
            <CardDescription>Koppla konto så vi kan hämta data i nästa steg.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Riot ID
                <input
                  type="text"
                  value={leagueForm.riotId}
                  onChange={(e) => setLeagueForm((prev) => ({ ...prev, riotId: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2"
                  placeholder="t.ex. Faker"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Tagline
                <input
                  type="text"
                  value={leagueForm.tagLine}
                  onChange={(e) => setLeagueForm((prev) => ({ ...prev, tagLine: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2"
                  placeholder="EUW"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Region
                <select
                  value={leagueForm.region}
                  onChange={(e) =>
                    setLeagueForm((prev) => ({ ...prev, region: e.target.value as LeagueRegion }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="EUW">EUW</option>
                  <option value="EUNE">EUNE</option>
                  <option value="NA">NA</option>
                  <option value="KR">KR</option>
                  <option value="BR">BR</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Rank-källa
                <select
                  value={leagueForm.rankPreference}
                  onChange={(e) =>
                    setLeagueForm((prev) => ({
                      ...prev,
                      rankPreference: e.target.value as "solo" | "flex",
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="solo">Solo Queue</option>
                  <option value="flex">Flex Queue</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={leagueForm.autoSync}
                onChange={(e) => setLeagueForm((prev) => ({ ...prev, autoSync: e.target.checked }))}
              />
              Auto-synk när datahämtning aktiveras
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Statusmeddelande
              <input
                type="text"
                value={leagueForm.statusMessage}
                onChange={(e) =>
                  setLeagueForm((prev) => ({ ...prev, statusMessage: e.target.value }))
                }
                className="rounded-md border border-input bg-background px-3 py-2"
                placeholder="Ready for ranked grind."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={leagueBusy} onClick={submitLeagueConnect}>
                <FontAwesomeIcon icon={faLink} data-icon="inline-start" />
                Koppla konto
              </Button>
              <Button type="button" variant="secondary" disabled={leagueBusy} onClick={submitLeagueSync}>
                <FontAwesomeIcon icon={faRotate} data-icon="inline-start" />
                Begär synk
              </Button>
              <Button type="button" variant="outline" disabled={leagueBusy} onClick={submitLeagueDisconnect}>
                <FontAwesomeIcon icon={faUnlink} data-icon="inline-start" />
                Koppla bort
              </Button>
            </div>

            {leagueMessage ? <p className="text-sm text-muted-foreground">{leagueMessage}</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faTrophy} /> Roadmap för hämtning av LoL-data
          </CardTitle>
          <CardDescription>Nästa implementation kan byggas direkt ovanpå denna grund.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>1. Lagra koppling per användare i databas (nu ligger den i minne).</p>
          <p>2. Koppla Riot API med server-side nyckel och rate limit-hantering.</p>
          <p>3. Hämta rank, senaste matcher och champion-statistik i en separat worker.</p>
          <p>4. Cacha data + visa senaste uppdatering på profilsidan.</p>
        </CardContent>
      </Card>
    </div>
  );
}
