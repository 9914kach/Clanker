import { faGamepad, faShieldHalved, faUserGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import { LayoutGrid } from "lucide-react";
import LeagueRankText from "@/components/LeagueRankText";
import HubDesktopSurface, { type HubDesktopContainer } from "@/components/HubDesktopSurface";
import { useHubPrefs } from "@/components/HubPrefsProvider";
import { gridStepForDensity } from "@/lib/hub-prefs";
import { useHubLocale } from "@/components/locale-provider";
import { apiUrl } from "@/config";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { useHubSurfaceEngine } from "@/hooks/use-hub-surface-engine";
import {
  formatGameDuration,
  getLeagueRankPalette,
  formatLeagueRank,
  formatTimestamp,
  type LeagueRankedEntry,
} from "@/lib/league-format";
import {
  PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS,
  PUBLIC_PROFILE_CONTAINER_ORDER,
  PUBLIC_PROFILE_NODES,
  type PublicProfileContainerId,
} from "@/lib/hub-public-profile-surface";
import { readContainerMetadataV1 } from "@/lib/hub-grid-node";
import { toBcp47, type HubLocale } from "@/i18n/hub-copy";

type LeagueRecentMatch = {
  matchId: string;
  gameCreation: number;
  gameDurationSeconds: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
  championLevel: number;
  win: boolean;
};

type PublicLeagueStats =
  | {
      available: false;
      source: "not_configured";
      lastSyncRequestedAt: string | null;
    }
  | {
      available: false;
      source: "not_synced";
      lastSyncRequestedAt: string | null;
    }
  | {
      available: true;
      source: "riot_sync";
      lastSyncRequestedAt: string | null;
      fetchedAt: string;
      rankPreference: "solo" | "flex";
      preferredRank: LeagueRankedEntry | null;
      leagueEntries: LeagueRankedEntry[];
      recentMatches: LeagueRecentMatch[];
      account: { gameName: string; tagLine: string };
    };

type PublicProfile = {
  user: {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    banner: string | null;
    accent_color: number | null;
  };
  integrations: {
    league: {
      riotId: string;
      tagLine: string;
      region: "EUW" | "EUNE" | "NA" | "KR" | "BR";
      linkedAt: string;
      lastSyncRequestedAt: string | null;
    } | null;
    steam: null;
  };
  stats: {
    league: PublicLeagueStats;
  };
};

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "not_found" }
  | { status: "error"; message: string };

async function readError(res: Response): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: string };
    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

function formatShortDate(value: string | null, locale: HubLocale, emptyLabel: string): string {
  if (!value) {
    return emptyLabel;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(toBcp47(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function leagueIntroLine(
  leagueLinked: boolean,
  stats: PublicLeagueStats,
  intro: {
    none: string;
    notSynced: string;
    soon: string;
    synced: string;
  },
): string {
  if (!leagueLinked) {
    return intro.none;
  }
  if (!stats.available) {
    if (stats.source === "not_synced") {
      return intro.notSynced;
    }
    return intro.soon;
  }
  return intro.synced;
}

export default function PublicProfilePage() {
  const { copy, locale } = useHubLocale();
  const p = copy.publicProfile;
  const { me, layoutEditMode, gridSnapEnabled, gridVisible } = useHubLayout();
  const { prefs } = useHubPrefs();
  const { userId = "" } = useParams();
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  const surface = useHubSurfaceEngine({
    layoutEditMode,
    gridSnapEnabled,
    gridStep: gridStepForDensity(prefs.desktop.gridDensity),
    prefs,
    defaultLayouts: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS,
    enableRemoteSync: false,
    persistence: {
      readLayout: () =>
        Object.fromEntries(
          Object.entries(PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS).map(([id, layout]) => [
            id,
            { ...layout },
          ]),
        ) as Record<string, typeof PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS[PublicProfileContainerId]>,
      writeLayout: () => undefined,
      readAutosaveEnabled: () => false,
      writeAutosaveEnabled: () => undefined,
    },
  });

  useEffect(() => {
    if (!userId) {
      setState({ status: "not_found" });
      return;
    }

    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/public/profile/${encodeURIComponent(userId)}`),
          { signal: controller.signal },
        );
        if (res.status === 404) {
          setState({ status: "not_found" });
          return;
        }
        if (!res.ok) {
          setState({ status: "error", message: await readError(res) });
          return;
        }

        setState({ status: "ready", profile: (await res.json()) as PublicProfile });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setState({
          status: "error",
          message: p.loadErrorNetwork,
        });
      }
    };

    setState({ status: "loading" });
    void loadProfile();

    return () => controller.abort();
  }, [p.loadErrorNetwork, userId]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{p.loadingTitle}</CardTitle>
            <CardDescription>{p.loadingDesc}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{p.notFoundTitle}</CardTitle>
            <CardDescription>{p.notFoundDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/dashboard">{p.toHub}</Link>
            </Button>
            <Button asChild>
              <Link to="/login">{copy.common.logIn}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{p.errorTitle}</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/dashboard">{p.toHub}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile } = state;
  const u = profile.user;
  const displayName = u.global_name ?? u.username;
  const leagueLinked = profile.integrations.league !== null;
  const stats = profile.stats.league;
  const leagueIntro = leagueIntroLine(leagueLinked, stats, p.leagueIntro);
  const riotSync = stats.available && stats.source === "riot_sync" ? stats : null;
  const leagueIdentity = profile.integrations.league
    ? `${profile.integrations.league.riotId}#${profile.integrations.league.tagLine}`
    : "—";
  const formattedLeagueRank = riotSync?.preferredRank
    ? formatLeagueRank(riotSync.preferredRank, locale)
    : null;
  const leagueRankPalette = riotSync ? getLeagueRankPalette(riotSync.preferredRank) : null;
  const leagueRankFallback = p.rankFallback;
  const isOwnProfile = me.status === "user" && me.profile.id === u.id;

  const sectionById: Record<string, ReactNode> = {
    status: (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FontAwesomeIcon icon={faShieldHalved} /> {p.cardStatusTitle}
          </CardTitle>
          <CardDescription>{p.cardStatusDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            {p.labelProfileStatus}: {leagueLinked ? p.profileStatusLeague : p.profileStatusBase}
          </p>
          <p>
            {p.labelLeagueConnection}: {leagueLinked ? p.leagueLinkPublished : p.leagueLinkNot}
          </p>
          <p>
            {p.labelLeagueStats}:{" "}
            {riotSync ? p.statsSynced : leagueLinked ? p.statsWaiting : p.statsNone}
          </p>
          <p>
            {p.steamTitle}: {p.steamNotLinked}
          </p>
        </CardContent>
      </Card>
    ),
    games: (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FontAwesomeIcon icon={faGamepad} /> {p.cardGamesTitle}
          </CardTitle>
          <CardDescription>{p.cardGamesDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          {profile.integrations.league ? (
            <>
              <p>
                <span className="font-mono text-foreground">{leagueIdentity}</span>
                <span className="px-2 text-muted-foreground/70">{p.separator}</span>
                <span className="text-foreground/90">{profile.integrations.league.region}</span>
              </p>
              <p>
                {p.gamesRankLabel}:{" "}
                {formattedLeagueRank ? (
                  leagueRankPalette ? (
                    <LeagueRankText
                      text={formattedLeagueRank}
                      colors={leagueRankPalette}
                      className="font-medium"
                    />
                  ) : (
                    <span className="text-foreground">{formattedLeagueRank}</span>
                  )
                ) : (
                  <span className="text-foreground">{leagueRankFallback}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground/80">
                {p.syncedShort(
                  formatShortDate(stats.lastSyncRequestedAt, locale, p.noSyncYetShort),
                )}
              </p>
            </>
          ) : (
            <>
              <p>{p.noLeaguePublic}</p>
              <p>{p.rankDash}</p>
              <p>{p.regionDash}</p>
            </>
          )}
        </CardContent>
      </Card>
    ),
    more: (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FontAwesomeIcon icon={faUserGear} /> {p.cardMoreTitle}
          </CardTitle>
          <CardDescription>{p.cardMoreDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            {p.discordId}: <span className="font-mono text-foreground">{u.id}</span>
          </p>
          <p>
            {p.displayName}: {displayName}
          </p>
          <p>
            {p.linkedSince}:{" "}
            {formatTimestamp(profile.integrations.league?.linkedAt ?? null, locale)}
          </p>
          <p>
            {p.lastLeagueSync}:{" "}
            {formatTimestamp(profile.integrations.league?.lastSyncRequestedAt ?? null, locale)}
          </p>
        </CardContent>
      </Card>
    ),
    leagueStats: (
      <Card>
        <CardHeader>
          <CardTitle>{p.leagueStatsTitle}</CardTitle>
          <CardDescription>
            {riotSync
              ? p.leagueStatsDescFetched(
                  formatTimestamp(riotSync.fetchedAt, locale),
                  `${riotSync.account.gameName}#${riotSync.account.tagLine}`,
                )
              : leagueIntro}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 text-sm">
          {!profile.integrations.league ? (
            <p className="text-muted-foreground">{p.noLeagueData}</p>
          ) : !riotSync ? (
            <p className="text-muted-foreground">
              {stats.source === "not_synced" ? p.notSyncedYet : p.statsUnavailable}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{p.accountLabel}</p>
                  <p className="mt-2 font-mono text-base font-medium text-foreground">
                    {leagueIdentity}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{p.regionLabel}</p>
                  <p className="mt-2 text-base font-medium text-foreground">
                    {profile.integrations.league.region}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-foreground">{p.rankedQueues}</p>
                {riotSync.leagueEntries.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {riotSync.leagueEntries.map((entry) => (
                      <div key={entry.queueType} className="rounded-md border border-border px-3 py-2">
                        <p className="text-foreground">{entry.queueType}</p>
                        <p className="text-muted-foreground">
                          {p.rankedEntryLine(entry.tier, entry.rank, entry.leaguePoints)}
                        </p>
                        <p className="text-muted-foreground">
                          {p.rankedEntryRecord(entry.wins, entry.losses, entry.hotStreak ? p.hotStreak : "")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{p.noRankedReturned}</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="font-medium text-foreground">{p.recentMatches}</p>
                {riotSync.recentMatches.length > 0 ? (
                  <div className="space-y-2">
                    {riotSync.recentMatches.map((match) => (
                      <div
                        key={match.matchId}
                        className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-foreground">
                            {match.championName}
                            <span className="px-2 text-muted-foreground/70">{p.separator}</span>
                            <span
                              className={
                                match.win
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-destructive"
                              }
                            >
                              {match.win ? p.win : p.loss}
                            </span>
                          </p>
                          <p className="text-muted-foreground">
                            {p.matchStatsLine(
                              match.kills,
                              match.deaths,
                              match.assists,
                              match.totalCs,
                              match.championLevel,
                            )}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground sm:text-right">
                          <p>{formatGameDuration(match.gameDurationSeconds)}</p>
                          <p>{formatTimestamp(new Date(match.gameCreation).toISOString(), locale)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{p.noMatchHistory}</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    ),
    steam: (
      <Card>
        <CardHeader>
          <CardTitle>{p.steamTitle}</CardTitle>
          <CardDescription>{p.steamDesc}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{p.steamBody}</CardContent>
      </Card>
    ),
  };

  const containerLabel: Record<PublicProfileContainerId, string> = {
    "public-profile.overview": p.pageTitle,
    "public-profile.league": p.leagueStatsTitle,
    "public-profile.steam": p.steamTitle,
  };

  const containers: HubDesktopContainer[] = PUBLIC_PROFILE_CONTAINER_ORDER.map((id) => {
    const node = PUBLIC_PROFILE_NODES[id];
    const md = node ? readContainerMetadataV1(node) : null;
    const children = md?.staticChildren ?? [];

    const childNodes = children.map((child) => sectionById[child.id]).filter(Boolean);
    const layoutClassName =
      id === "public-profile.overview" ? "grid gap-4 lg:grid-cols-3" : "flex flex-col gap-4";

    return {
      id,
      label: containerLabel[id],
      description: "",
      tone: "useful",
      icon: LayoutGrid,
      content: <div className={layoutClassName}>{childNodes}</div>,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.pageTitle}</h1>
          <p className="mt-2 text-muted-foreground">{p.pageIntro(displayName, leagueIntro)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
          {isOwnProfile ? (
            <Button type="button" variant="secondary" asChild>
              <Link to="/profile/settings">{p.settingsButton}</Link>
            </Button>
          ) : null}
          <Button type="button" asChild>
            <Link to="/dashboard">{p.openHub}</Link>
          </Button>
        </div>
      </motion.header>
      <HubDesktopSurface
        variant="panel"
        widgets={[]}
        containers={containers}
        layouts={surface.activeLayout}
        hiddenWidgetIds={[]}
        onMoveWidget={surface.moveWidget}
        onResizeWidget={surface.resizeWidget}
        onFocusWidget={surface.focusWidget}
        onOpenWidget={() => undefined}
        onHideWidget={() => undefined}
        layoutEditMode={layoutEditMode}
        gridStep={gridStepForDensity(prefs.desktop.gridDensity)}
        gridSnapEnabled={gridSnapEnabled}
        gridCompaction={prefs.desktop.gridCompaction}
        showGrid={gridVisible}
        selectedWidgetIds={surface.selectedWidgetIds}
        onSelectWidget={surface.toggleWidgetInSelection}
      />
    </div>
  );
}

