import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import { Button } from "@clanker/ui/components/button";
import { useHubLocale } from "@/components/locale-provider";
import { apiUrl } from "@/config";
import { formatGameDuration } from "@/lib/league-format";
import type { HubCopy, HubLocale } from "@/i18n/hub-copy";

type LinkedAccount = {
  riotId: string;
  tagLine: string;
  region: string;
  puuid: string | null;
};

// ── Types ─────────────────────────────────────────────────────────────────────

type QueueStat = {
  queueId: number;
  games: number;
  wins: number;
  winRate: number;
};

type ChampionStat = {
  champion: string;
  games: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCs: number;
};

type MatchRow = {
  matchId: string;
  queueId: number;
  gameMode: string;
  gameType: string;
  mapId: number;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  championLevel: number;
  win: boolean;
  durationSec: number;
  lane: string;
  role: string;
  playedAt: string;
};

type LeagueStats = {
  available: true;
  totalGames: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCs: number;
  avgDurationSec: number;
  byQueue: QueueStat[];
  byChampion: ChampionStat[];
};

type StatsResponse = { available: false } | LeagueStats;

type LeagueStatsPageCopy = HubCopy["leagueStatsPage"];

const MATCH_PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

function queueLabel(queueId: number, ls: LeagueStatsPageCopy): string {
  switch (queueId) {
    case 420:
      return ls.queueSoloDuo;
    case 440:
      return ls.queueFlex;
    case 450:
      return ls.queueAram;
    case 490:
      return ls.queueQuickplay;
    case 400:
      return ls.queueNormalDraft;
    case 0:
      return ls.queueCustom;
    default:
      return ls.queueUnknown(queueId);
  }
}

function modeTypeLine(gameMode: string, gameType: string): string {
  const gm = gameMode.trim();
  const gt = gameType.trim();
  if (!gm && !gt) return "";
  if (!gt) return gm;
  if (!gm) return gt;
  return `${gm} · ${gt}`;
}

function kdaString(kills: number, deaths: number, assists: number): string {
  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;
  return `${kda.toFixed(2)} KDA`;
}

function winRateColor(rate: number): string {
  if (rate >= 60) return "text-emerald-400";
  if (rate >= 50) return "text-blue-400";
  return "text-rose-400";
}

function formatRelativePlayedAt(isoString: string, locale: HubLocale): string {
  const then = new Date(isoString).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", {
    numeric: "auto",
  });
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffSec < 45) return rtf.format(0, "second");
  if (diffSec < hour) {
    const m = Math.max(1, Math.round(diffSec / minute));
    return rtf.format(-m, "minute");
  }
  if (diffSec < day) {
    const h = Math.round(diffSec / hour);
    return rtf.format(-h, "hour");
  }
  const d = Math.round(diffSec / day);
  return rtf.format(-d, "day");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function QueueBreakdown({
  queues,
  ls,
}: {
  queues: QueueStat[];
  ls: LeagueStatsPageCopy;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{ls.breakdownByQueue}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="text-left px-4 py-2 font-medium">{ls.thQueueMode}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thMatches}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thWl}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thWinPct}</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.queueId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-medium">{queueLabel(q.queueId, ls)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{q.games}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {q.wins} / {q.games - q.wins}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-semibold ${winRateColor(q.winRate)}`}>
                  {q.winRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ChampionTable({
  champions,
  ls,
}: {
  champions: ChampionStat[];
  ls: LeagueStatsPageCopy;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{ls.championsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="text-left px-4 py-2 font-medium">{ls.thChampion}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thChampMatches}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thChampWinPct}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thChampKda}</th>
              <th className="text-right px-4 py-2 font-medium">{ls.thChampCsPerGame}</th>
            </tr>
          </thead>
          <tbody>
            {champions.map((c) => (
              <tr key={c.champion} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-medium">{c.champion}</td>
                <td className="px-4 py-2 text-right tabular-nums">{c.games}</td>
                <td className={`px-4 py-2 text-right tabular-nums font-semibold ${winRateColor(c.winRate)}`}>
                  {c.winRate}%
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {kdaString(c.avgKills, c.avgDeaths, c.avgAssists)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{c.avgCs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

type MatchesPageResponse = {
  total: number;
  offset: number;
  limit: number;
  matches: MatchRow[];
};

function MatchHistory({
  ls,
  locale,
  matches,
  total,
  offset,
  limit,
  loading,
  error,
  onPrev,
  onNext,
}: {
  ls: LeagueStatsPageCopy;
  locale: HubLocale;
  matches: MatchRow[];
  total: number;
  offset: number;
  limit: number;
  loading: boolean;
  error: string | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + matches.length;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{ls.matchHistoryTitle}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <p className="px-4 py-6 text-sm text-rose-400">{error}</p>
        ) : loading && matches.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{ls.loadingMatches}</p>
        ) : (
          <div className="divide-y">
            {matches.map((m) => {
              const modeLine = modeTypeLine(m.gameMode, m.gameType);
              const goldK = String(Math.round((m.goldEarned / 1000) * 10) / 10);
              return (
                <div
                  key={m.matchId}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${
                    m.win ? "border-l-2 border-emerald-500" : "border-l-2 border-rose-500"
                  }`}
                >
                  <div className="w-12 text-center shrink-0">
                    <span className={`text-xs font-bold ${m.win ? "text-emerald-400" : "text-rose-400"}`}>
                      {m.win ? ls.winBadge : ls.lossBadge}
                    </span>
                  </div>

                  <div className="w-28 truncate shrink-0">
                    <span className="font-semibold text-sm">{m.champion}</span>
                    <span className="text-xs text-muted-foreground block">{ls.levelShort(m.championLevel)}</span>
                  </div>

                  <div className="flex-1 text-sm min-w-0">
                    <span className="tabular-nums">
                      {m.kills}/{m.deaths}/{m.assists}
                    </span>
                    <span className="text-muted-foreground text-xs ml-2">
                      {kdaString(m.kills, m.deaths, m.assists)}
                    </span>
                  </div>

                  <div className="text-right text-xs text-muted-foreground w-20 shrink-0">
                    <div>
                      {m.cs} {ls.csLabel}
                    </div>
                    <div>{ls.goldK(goldK)}</div>
                  </div>

                  <div className="text-right text-xs text-muted-foreground w-28 shrink-0">
                    <div>{queueLabel(m.queueId, ls)}</div>
                    {modeLine ? (
                      <div className="truncate" title={modeLine}>
                        {modeLine}
                      </div>
                    ) : null}
                    <div>{formatGameDuration(m.durationSec)}</div>
                  </div>

                  <div className="text-right text-xs text-muted-foreground w-20 shrink-0">
                    {formatRelativePlayedAt(m.playedAt, locale)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t bg-muted/20">
            <p className="text-xs text-muted-foreground tabular-nums">
              {ls.paginationRange(from, to, total)}
              <span className="mx-2 opacity-40">·</span>
              {ls.paginationPage(page, totalPages)}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!canPrev || loading} onClick={onPrev}>
                {ls.paginationPrev}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!canNext || loading} onClick={onNext}>
                {ls.paginationNext}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeagueStatsPage() {
  const { copy, locale } = useHubLocale();
  const ls = copy.leagueStatsPage;

  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [selectedPuuid, setSelectedPuuid] = useState<string | null>(null);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allAccounts, setAllAccounts] = useState<LinkedAccount[]>([]);

  const [matchOffset, setMatchOffset] = useState(0);
  const [matchState, setMatchState] = useState<{
    loading: boolean;
    error: string | null;
    total: number;
    matches: MatchRow[];
  } | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/integrations/league/status"), { credentials: "include" })
      .then((r) => r.json() as Promise<{ accounts?: LinkedAccount[] }>)
      .then((d) => {
        const all = d.accounts ?? [];
        const synced = all.filter((a) => a.puuid);
        setAllAccounts(all);
        setAccounts(synced);
        if (synced.length > 0 && synced[0].puuid) {
          setSelectedPuuid(synced[0].puuid);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setMatchOffset(0);
  }, [selectedPuuid]);

  useEffect(() => {
    if (!selectedPuuid) return;
    setLoading(true);
    setData(null);
    setError(null);
    fetch(apiUrl(`/api/stats/league?puuid=${encodeURIComponent(selectedPuuid)}`), {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StatsResponse>;
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "HTTP"))
      .finally(() => setLoading(false));
  }, [selectedPuuid]);

  useEffect(() => {
    if (!selectedPuuid || !data || !data.available) {
      setMatchState(null);
      return;
    }
    let cancelled = false;
    setMatchState((prev) => ({
      loading: true,
      error: null,
      total: prev?.total ?? 0,
      matches: prev?.matches ?? [],
    }));
    const q = new URLSearchParams({
      puuid: selectedPuuid,
      offset: String(matchOffset),
      limit: String(MATCH_PAGE_SIZE),
    });
    fetch(apiUrl(`/api/stats/league/matches?${q.toString()}`), { credentials: "include" })
      .then((r) => {
        if (r.status === 403) throw new Error("403");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MatchesPageResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setMatchState({
          loading: false,
          error: null,
          total: body.total,
          matches: body.matches,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setMatchState({
          loading: false,
          error: copy.leagueStatsPage.matchesLoadError,
          total: 0,
          matches: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPuuid, matchOffset, data, copy]);

  const selectedAccount = accounts.find((a) => a.puuid === selectedPuuid);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">{ls.loading}</div>
    );
  }

  if (accounts.length === 0) {
    if (allAccounts.length > 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm max-w-lg mx-auto text-center px-4">
          <p className="font-semibold text-base text-foreground">{ls.syncRequiredTitle}</p>
          <p>{ls.syncRequiredBody(allAccounts.map((a) => `${a.riotId}#${a.tagLine}`).join(", "))}</p>
          <p>
            <a href="/settings/profile" className="underline text-foreground hover:text-primary">
              {ls.syncRequiredLinkLabel}
            </a>{" "}
            {ls.syncRequiredAction}
          </p>
          <p className="text-xs opacity-60">{ls.syncRequiredApiHint}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm px-4 text-center">
        <p className="font-semibold text-base text-foreground">{ls.noLinkedTitle}</p>
        <p>{ls.noLinkedBody}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-rose-400 text-sm px-4 text-center">
        {ls.loadError(error)}
      </div>
    );
  }

  if (!data || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm px-4 text-center">
        <p className="font-semibold text-base text-foreground">{ls.noMatchesTitle}</p>
        <p>{ls.noMatchesBody}</p>
      </div>
    );
  }

  const avgKda =
    data.avgDeaths === 0
      ? data.avgKills + data.avgAssists
      : (data.avgKills + data.avgAssists) / data.avgDeaths;

  const accountLine = selectedAccount ? ` för ${selectedAccount.riotId}#${selectedAccount.tagLine}` : "";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ls.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{ls.subtitle(data.totalGames, accountLine)}</p>
        </div>

        {accounts.length > 1 && (
          <select
            value={selectedPuuid ?? ""}
            onChange={(e) => setSelectedPuuid(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.puuid} value={a.puuid ?? ""}>
                {a.riotId}#{a.tagLine} ({a.region})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={ls.statGames}
          value={data.totalGames}
          sub={ls.statGamesSub(data.wins, data.totalGames - data.wins)}
        />
        <StatCard
          label={ls.statWinRate}
          value={`${data.winRate}%`}
          valueClass={winRateColor(data.winRate)}
        />
        <StatCard
          label={ls.statKda}
          value={avgKda.toFixed(2)}
          sub={ls.statKdaSub(data.avgKills, data.avgDeaths, data.avgAssists)}
        />
        <StatCard
          label={ls.statCs}
          value={data.avgCs}
          sub={ls.statCsSub(formatGameDuration(data.avgDurationSec))}
        />
      </div>

      {data.byQueue.length > 0 && <QueueBreakdown queues={data.byQueue} ls={ls} />}
      {data.byChampion.length > 0 && <ChampionTable champions={data.byChampion} ls={ls} />}

      {data.totalGames > 0 && matchState && (
        <MatchHistory
          ls={ls}
          locale={locale}
          matches={matchState.matches}
          total={matchState.total}
          offset={matchOffset}
          limit={MATCH_PAGE_SIZE}
          loading={matchState.loading}
          error={matchState.error}
          onPrev={() => setMatchOffset((o) => Math.max(0, o - MATCH_PAGE_SIZE))}
          onNext={() => setMatchOffset((o) => o + MATCH_PAGE_SIZE)}
        />
      )}
    </div>
  );
}
