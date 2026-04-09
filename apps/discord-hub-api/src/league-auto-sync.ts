/**
 * League of Legends auto-sync scheduler.
 *
 * Started only when `LEAGUE_AUTO_SYNC_ENABLED=1` and `RIOT_API_KEY` is set (see `index.ts`).
 *
 * Runs on a configurable interval (default 30 min) and syncs all linked accounts:
 *   - Fetches only NEW matches (deduplication via stats.league_matches)
 *   - Always snapshots current rank (for LP-over-time charts)
 *   - Updates the live snapshot (profile.league_snapshots) for dashboard display
 *
 * Rate limiting: default delay matches typical **application** limits (100 req / 2 min).
 * Production-approved apps with higher quotas: set `LEAGUE_CALL_DELAY_MS` lower (e.g. 100).
 *
 * LEAGUE_MATCH_FETCH_COUNT: max match IDs to pull per sync (paginated in 100-ID pages).
 */

import {
  fetchRankedEntries,
  fetchAllMatchIds,
  fetchNewMatches,
  getLeagueApiHosts,
  queueTypeForRankPreference,
  type LeagueRegion,
  RIOT_TYPICAL_DEV_APP_DELAY_MS,
} from "./riot-lol.js";
import {
  getAllLeagueConnections,
  getKnownMatchIds,
  saveLeagueMatches,
  saveLeagueRankHistory,
  upsertLeagueConnection,
  upsertLeagueSnapshot,
  getLeagueSnapshot,
} from "./repo.js";

const SYNC_INTERVAL_MS = Number(process.env.LEAGUE_SYNC_INTERVAL_MS ?? 10 * 60 * 1000); // 10 min
const CALL_DELAY_MS = Number(
  process.env.LEAGUE_CALL_DELAY_MS ?? String(RIOT_TYPICAL_DEV_APP_DELAY_MS),
); // between Riot API calls (see RIOT_TYPICAL_DEV_APP_DELAY_MS)
const USER_DELAY_MS = Number(process.env.LEAGUE_USER_DELAY_MS ?? 300);   // between users
const MATCH_FETCH_COUNT = Number(process.env.LEAGUE_MATCH_FETCH_COUNT ?? 50); // history depth per sync

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncOneUser(
  conn: {
    user_id: string;
    riot_id: string;
    tag_line: string;
    region: LeagueRegion;
    rank_preference: "solo" | "flex";
    auto_sync: boolean;
    status_message: string;
    linked_at: string;
    puuid: string | null;
  },
  apiKey: string,
): Promise<{ newMatches: number }> {
  const { user_id: userId, riot_id: riotId, tag_line: tagLine, region, rank_preference: rankPreference } = conn;
  const hosts = getLeagueApiHosts(region);

  // 1. Resolve PUUID — use stored puuid from connection; call Riot API if not yet known
  let puuid = conn.puuid ?? "";

  if (!puuid) {
    const { resolvePuuid } = await import("./riot-lol.js");
    const account = await resolvePuuid(apiKey, hosts.regionalBaseUrl, riotId, tagLine);
    puuid = account.puuid;
    await sleep(CALL_DELAY_MS);
  }

  // Get existing snapshot for this specific account
  const existing = await getLeagueSnapshot(userId, puuid);

  // 2. Rank entries
  const leagueEntries = await fetchRankedEntries(apiKey, hosts.platformBaseUrl, puuid);
  await sleep(CALL_DELAY_MS);

  // 3. Match IDs — paginate up to LEAGUE_MATCH_FETCH_COUNT (100 IDs/page, Riot cap ~1000)
  const matchIds = await fetchAllMatchIds(
    apiKey,
    hosts.regionalBaseUrl,
    puuid,
    MATCH_FETCH_COUNT,
    CALL_DELAY_MS,
  );
  await sleep(CALL_DELAY_MS);

  // 4. Filter to only unseen matches — scoped to this puuid
  const knownIds = await getKnownMatchIds(userId, puuid, matchIds);
  const newMatchCount = matchIds.filter((id) => !knownIds.has(id)).length;

  // 5. Fetch and save new matches (reuse match ID list — no second match-list crawl)
  const newMatches = await fetchNewMatches({
    apiKey,
    region,
    puuid,
    knownMatchIds: knownIds,
    count: MATCH_FETCH_COUNT,
    prefetchedMatchIds: matchIds,
  });
  if (newMatches.length > 0) {
    await saveLeagueMatches(userId, puuid, newMatches);
  }

  // 6. Save rank snapshot (always — LP can change without new matches)
  await saveLeagueRankHistory(userId, puuid, leagueEntries);

  // 7. Update the live snapshot used by the dashboard (per-account)
  const preferredRank =
    leagueEntries.find(
      (e) => e.queueType === queueTypeForRankPreference(rankPreference),
    ) ?? null;

  const recentForDisplay =
    newMatches.length >= 5
      ? newMatches.slice(0, 5)
      : [...newMatches, ...(existing?.recentMatches ?? [])].slice(0, 5);

  await upsertLeagueSnapshot(userId, {
    fetchedAt: new Date().toISOString(),
    account: { puuid, gameName: riotId, tagLine },
    rankPreference,
    preferredRank,
    leagueEntries,
    recentMatches: recentForDisplay,
  });

  // 8. Store resolved puuid back on the connection row if it was missing
  if (!conn.puuid) {
    await upsertLeagueConnection(userId, {
      riot_id: riotId,
      tag_line: tagLine,
      region,
      auto_sync: conn.auto_sync,
      rank_preference: rankPreference,
      status_message: conn.status_message,
      linked_at: conn.linked_at,
      last_sync_requested_at: new Date().toISOString(),
      puuid,
    });
  }

  return { newMatches: newMatchCount };
}

async function runSyncCycle(apiKey: string): Promise<void> {
  const connections = await getAllLeagueConnections();
  if (connections.length === 0) return;

  console.log(`[league-sync] Starting cycle — ${connections.length} account(s)`);
  let synced = 0;
  let totalNew = 0;
  let errors = 0;

  for (const conn of connections) {
    try {
      const { newMatches } = await syncOneUser(
        {
          user_id: conn.user_id,
          riot_id: conn.riot_id,
          tag_line: conn.tag_line,
          region: conn.region as LeagueRegion,
          rank_preference: conn.rank_preference as "solo" | "flex",
          auto_sync: conn.auto_sync,
          status_message: conn.status_message,
          linked_at: String(conn.linked_at),
          puuid: conn.puuid ?? null,
        },
        apiKey,
      );
      synced++;
      totalNew += newMatches;
      if (newMatches > 0) {
        console.log(`[league-sync] ${conn.riot_id}#${conn.tag_line} — ${newMatches} new match(es)`);
      }
    } catch (err) {
      errors++;
      console.error(`[league-sync] Failed for ${conn.riot_id}#${conn.tag_line}:`, (err as Error).message);
    }
    await sleep(USER_DELAY_MS);
  }

  console.log(
    `[league-sync] Cycle done — ${synced}/${connections.length} synced, ${totalNew} new matches, ${errors} error(s)`,
  );
}

export function startLeagueSyncScheduler(apiKey: string): void {
  // Run immediately on startup, then on the configured interval
  void runSyncCycle(apiKey).catch((err) =>
    console.error("[league-sync] Initial cycle failed:", err),
  );

  setInterval(() => {
    void runSyncCycle(apiKey).catch((err) =>
      console.error("[league-sync] Scheduled cycle failed:", err),
    );
  }, SYNC_INTERVAL_MS);

  const minutes = Math.round(SYNC_INTERVAL_MS / 60_000);
  console.log(
    `[league-sync] Scheduler started — interval ${minutes} min, ${MATCH_FETCH_COUNT} matches/user, ${CALL_DELAY_MS}ms call delay`,
  );
}
