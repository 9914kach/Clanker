/**
 * League of Legends auto-sync scheduler.
 *
 * Runs on a configurable interval (default 30 min) and syncs all linked accounts:
 *   - Fetches only NEW matches (deduplication via stats.league_matches)
 *   - Always snapshots current rank (for LP-over-time charts)
 *   - Updates the live snapshot (profile.league_snapshots) for dashboard display
 *
 * Rate limiting: tuned for a production API key (typically 2000 req/10 s).
 * Delays are kept minimal — adjust via env vars if you hit 429s.
 */

import {
  fetchRankedEntries,
  fetchRecentMatchIds,
  fetchNewMatches,
  getLeagueApiHosts,
  queueTypeForRankPreference,
  type LeagueRegion,
} from "./riot-lol.js";
import {
  getAllLeagueConnections,
  getKnownMatchIds,
  saveLeagueMatches,
  saveLeagueRankHistory,
  upsertLeagueSnapshot,
  getLeagueSnapshot,
} from "./repo.js";

const SYNC_INTERVAL_MS = Number(process.env.LEAGUE_SYNC_INTERVAL_MS ?? 10 * 60 * 1000); // 10 min
const CALL_DELAY_MS = Number(process.env.LEAGUE_CALL_DELAY_MS ?? 100);   // between Riot API calls
const USER_DELAY_MS = Number(process.env.LEAGUE_USER_DELAY_MS ?? 300);   // between users
const MATCH_FETCH_COUNT = Number(process.env.LEAGUE_MATCH_FETCH_COUNT ?? 50); // history depth per sync

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncOneUser(
  userId: string,
  riotId: string,
  tagLine: string,
  region: LeagueRegion,
  rankPreference: "solo" | "flex",
  apiKey: string,
): Promise<{ newMatches: number }> {
  const hosts = getLeagueApiHosts(region);

  // 1. Resolve PUUID (reuse stored puuid from existing snapshot if available to save a call)
  const existing = await getLeagueSnapshot(userId);
  let puuid = existing?.account.puuid ?? "";

  if (!puuid) {
    const { resolvePuuid } = await import("./riot-lol.js");
    const account = await resolvePuuid(apiKey, hosts.regionalBaseUrl, riotId, tagLine);
    puuid = account.puuid;
    await sleep(CALL_DELAY_MS);
  }

  // 2. Rank entries
  const leagueEntries = await fetchRankedEntries(apiKey, hosts.platformBaseUrl, puuid);
  await sleep(CALL_DELAY_MS);

  // 3. Match IDs
  const matchIds = await fetchRecentMatchIds(apiKey, hosts.regionalBaseUrl, puuid, MATCH_FETCH_COUNT);
  await sleep(CALL_DELAY_MS);

  // 4. Filter to only unseen matches
  const knownIds = await getKnownMatchIds(userId, matchIds);
  const newMatchCount = matchIds.filter((id) => !knownIds.has(id)).length;

  // 5. Fetch and save new matches (with per-call delay)
  const newMatches = await fetchNewMatches({
    apiKey,
    region,
    puuid,
    knownMatchIds: knownIds,
    count: MATCH_FETCH_COUNT,
  });
  if (newMatches.length > 0) {
    await saveLeagueMatches(userId, puuid, newMatches);
  }

  // 6. Save rank snapshot (always — LP can change without new matches)
  await saveLeagueRankHistory(userId, puuid, leagueEntries);

  // 7. Update the live snapshot used by the dashboard
  const preferredRank =
    leagueEntries.find(
      (e) => e.queueType === queueTypeForRankPreference(rankPreference),
    ) ?? null;

  // Use last 5 matches from the freshly-fetched batch OR fall back to existing snapshot matches
  const recentForDisplay =
    newMatches.length >= 5
      ? newMatches.slice(0, 5)
      : [
          ...newMatches,
          ...(existing?.recentMatches ?? []),
        ].slice(0, 5);

  await upsertLeagueSnapshot(userId, {
    fetchedAt: new Date().toISOString(),
    account: { puuid, gameName: riotId, tagLine },
    rankPreference,
    preferredRank,
    leagueEntries,
    recentMatches: recentForDisplay,
  });

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
        conn.user_id,
        conn.riot_id,
        conn.tag_line,
        conn.region as LeagueRegion,
        conn.rank_preference as "solo" | "flex",
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
