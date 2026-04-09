import { faGamepad, faCircleDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import LeagueRankText from "@/components/LeagueRankText";
import { useHubLocale } from "@/components/locale-provider";
import { apiUrl } from "@/config";
import { useHubLayout } from "@/hooks/use-hub-layout";
import {
  formatGameDuration,
  getLeagueRankPalette,
  formatLeagueRank,
  formatTimestamp,
  type LeagueRankedEntry,
} from "@/lib/league-format";
import {
  discordAvatarUrl,
  discordBannerUrl,
  accentColorToHex,
} from "@/lib/discordCdn";
import { toBcp47, type HubLocale } from "@/i18n/hub-copy";

type LeagueRecentMatch = {
  matchId: string;
  gameCreation: number;
  gameDurationSeconds: number;
  queueId?: number;
  gameMode?: string;
  gameType?: string;
  mapId?: number;
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
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(toBcp47(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PublicProfilePage() {
  const { copy, locale } = useHubLocale();
  const p = copy.publicProfile;
  const { me } = useHubLayout();
  const { userId = "" } = useParams();
  const [state, setState] = useState<ProfileState>({ status: "loading" });

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
        if ((error as Error).name === "AbortError") return;
        setState({ status: "error", message: p.loadErrorNetwork });
      }
    };

    setState({ status: "loading" });
    void loadProfile();
    return () => controller.abort();
  }, [p.loadErrorNetwork, userId]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">
        {p.loadingTitle}
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{p.notFoundTitle}</CardTitle>
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
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{p.errorTitle}</CardTitle>
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
  const riotSync =
    profile.stats.league.available && profile.stats.league.source === "riot_sync"
      ? profile.stats.league
      : null;
  const leagueRankPalette = riotSync ? getLeagueRankPalette(riotSync.preferredRank) : null;
  const formattedLeagueRank = riotSync?.preferredRank
    ? formatLeagueRank(riotSync.preferredRank, locale)
    : null;
  const isOwnProfile = me.status === "user" && me.profile.id === u.id;

  const accentHex = u.accent_color ? accentColorToHex(u.accent_color) : "#5865f2";
  const bannerBg = u.banner
    ? `url(${discordBannerUrl(u.id, u.banner, 600)})`
    : `linear-gradient(135deg, ${accentHex}cc 0%, ${accentHex}44 100%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto max-w-4xl"
    >
      {/* Banner + avatar header */}
      <div className="relative">
        <div
          className="h-44 w-full rounded-xl bg-cover bg-center sm:h-56"
          style={{ backgroundImage: bannerBg }}
        />

        {/* Avatar */}
        <div className="absolute bottom-0 left-6 translate-y-1/2">
          <img
            src={discordAvatarUrl(u.id, u.avatar, 128)}
            alt={displayName}
            className="h-24 w-24 rounded-full border-4 border-background shadow-lg sm:h-28 sm:w-28"
          />
        </div>
      </div>

      {/* Name row */}
      <div className="mt-14 flex flex-wrap items-start justify-between gap-3 px-2 sm:mt-16">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
          <p className="text-sm text-muted-foreground">@{u.username}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isOwnProfile && (
            <Button variant="secondary" asChild>
              <Link to="/profile/settings">{p.settingsButton}</Link>
            </Button>
          )}
          <Button asChild>
            <Link to="/dashboard">{p.openHub}</Link>
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="mt-8 flex flex-col gap-6 px-2">
        {/* League section */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <FontAwesomeIcon icon={faGamepad} />
            {p.cardGamesTitle}
          </h2>

          {!profile.integrations.league ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                {p.noLeaguePublic}
              </CardContent>
            </Card>
          ) : !riotSync ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                {profile.stats.league.source === "not_synced" ? p.notSyncedYet : p.statsUnavailable}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Identity + rank bar */}
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {p.accountLabel}
                    </span>
                    <span className="font-mono text-lg font-semibold text-foreground">
                      {riotSync.account.gameName}
                      <span className="text-muted-foreground">#{riotSync.account.tagLine}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {profile.integrations.league.region}
                      {" · "}
                      {p.syncedShort(
                        formatShortDate(
                          profile.stats.league.lastSyncRequestedAt,
                          locale,
                          p.noSyncYetShort,
                        ),
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {p.gamesRankLabel}
                    </span>
                    {formattedLeagueRank ? (
                      leagueRankPalette ? (
                        <LeagueRankText
                          text={formattedLeagueRank}
                          colors={leagueRankPalette}
                          className="text-2xl font-bold"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-foreground">
                          {formattedLeagueRank}
                        </span>
                      )
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground">
                        {p.rankFallback}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Ranked queues */}
              {riotSync.leagueEntries.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {riotSync.leagueEntries.map((entry) => (
                    <Card key={entry.queueType}>
                      <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {entry.queueType}
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {p.rankedEntryLine(entry.tier, entry.rank, entry.leaguePoints)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {p.rankedEntryRecord(
                            entry.wins,
                            entry.losses,
                            entry.hotStreak ? p.hotStreak : "",
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Recent matches */}
              {riotSync.recentMatches.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {p.recentMatches}
                  </p>
                  <div className="flex flex-col gap-2">
                    {riotSync.recentMatches.map((match) => (
                      <Card key={match.matchId}>
                        <CardContent className="flex items-center justify-between gap-4 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-1.5 self-stretch rounded-full ${match.win ? "bg-emerald-500" : "bg-destructive"}`}
                            />
                            <div>
                              <p className="font-medium text-foreground">{match.championName}</p>
                              <p className="text-sm text-muted-foreground">
                                {p.matchStatsLine(
                                  match.kills,
                                  match.deaths,
                                  match.assists,
                                  match.totalCs,
                                  match.championLevel,
                                )}
                              </p>
                              {(() => {
                                const mode = p.leagueMatchModeLine(
                                  match.gameMode ?? "",
                                  match.gameType ?? "",
                                );
                                return mode ? (
                                  <p className="text-xs text-muted-foreground/90">{mode}</p>
                                ) : null;
                              })()}
                            </div>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <p
                              className={
                                match.win
                                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                                  : "font-medium text-destructive"
                              }
                            >
                              {match.win ? p.win : p.loss}
                            </p>
                            <p>{formatGameDuration(match.gameDurationSeconds)}</p>
                            <p className="text-xs">
                              {formatTimestamp(new Date(match.gameCreation).toISOString(), locale)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Steam placeholder */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <FontAwesomeIcon icon={faCircleDot} />
            {p.steamTitle}
          </h2>
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {p.steamBody}
            </CardContent>
          </Card>
        </section>
      </div>
    </motion.div>
  );
}
