export type LeagueRegion = "EUW" | "EUNE" | "NA" | "KR" | "BR";

export type LeagueRankPreference = "solo" | "flex";

/**
 * Riot match-v5 `GET /lol/match/v5/matches/by-puuid/{puuid}/ids` (see developer.riotgames.com).
 * - `count`: 1–100 per request.
 * - `type` (optional): ranked | normal | tourney | tutorial — omit for all queue types incl. most customs.
 * - History is paginated with `start`; Riot caps visible history (~1000 match IDs per player).
 *
 * **Two different things:** (1) Per-**method** limits for approved production apps (e.g. match-v5
 * **2000 requests / 10 s**). (2) Per-**application** limits on your key — typical personal/dev apps:
 * **20 requests / 1 s** and **100 requests / 2 minutes**. Every call counts against the app bucket;
 * the 100/2 min window caps long syncs, so spacing ≥ `120_000 / 100` ms (~**1200 ms**) is safe.
 */
export const MATCH_V5_PUUID_IDS_MAX_COUNT = 100;
export const MATCH_V5_PUUID_IDS_HISTORY_CAP = 1000;
/** Riot-documented short window for LoL match-v5 match + match-id list (requests per 10 s, production). */
export const RIOT_MATCH_V5_LIMIT_PER_10_SECONDS = 2000;
/**
 * Suggested minimum spacing between Riot calls for typical **app** limits (100 req / 120 s).
 * Override with `LEAGUE_MANUAL_RIOT_DELAY_MS` / `LEAGUE_CALL_DELAY_MS`; production-approved apps can go much lower.
 */
export const RIOT_TYPICAL_DEV_APP_DELAY_MS = Math.ceil(120_000 / 100);

/** Valid `type` query values for match ID listing (not `custom`). */
export type MatchV5MatchListType = "ranked" | "normal" | "tourney" | "tutorial";

export type LeagueApiHosts = {
  regionalBaseUrl: string;
  platformBaseUrl: string;
};

export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export type LeagueRankedEntry = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
};

export type LeagueRecentMatch = {
  matchId: string;
  gameCreation: number;
  gameDurationSeconds: number;
  queueId: number;
  /** From match `info.gameMode` (e.g. CLASSIC, ARAM). */
  gameMode: string;
  /** From match `info.gameType` (e.g. MATCHED_GAME, CUSTOM_GAME). */
  gameType: string;
  /** From match `info.mapId`. */
  mapId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
  goldEarned: number;
  championLevel: number;
  win: boolean;
  lane: string;
  role: string;
  participantName: string;
};

export type LeaguePlayerSnapshot = {
  fetchedAt: string;
  account: RiotAccount;
  rankPreference: LeagueRankPreference;
  preferredRank: LeagueRankedEntry | null;
  leagueEntries: LeagueRankedEntry[];
  recentMatches: LeagueRecentMatch[];
};

const REGION_HOSTS: Record<LeagueRegion, LeagueApiHosts> = {
  EUW: {
    regionalBaseUrl: "https://europe.api.riotgames.com",
    platformBaseUrl: "https://euw1.api.riotgames.com",
  },
  EUNE: {
    regionalBaseUrl: "https://europe.api.riotgames.com",
    platformBaseUrl: "https://eun1.api.riotgames.com",
  },
  NA: {
    regionalBaseUrl: "https://americas.api.riotgames.com",
    platformBaseUrl: "https://na1.api.riotgames.com",
  },
  KR: {
    regionalBaseUrl: "https://asia.api.riotgames.com",
    platformBaseUrl: "https://kr.api.riotgames.com",
  },
  BR: {
    regionalBaseUrl: "https://americas.api.riotgames.com",
    platformBaseUrl: "https://br1.api.riotgames.com",
  },
};

type RiotLeagueEntryResponse = {
  queueType?: unknown;
  tier?: unknown;
  rank?: unknown;
  leaguePoints?: unknown;
  wins?: unknown;
  losses?: unknown;
  hotStreak?: unknown;
};

type RiotMatchParticipantResponse = {
  puuid?: unknown;
  riotIdGameName?: unknown;
  championName?: unknown;
  kills?: unknown;
  deaths?: unknown;
  assists?: unknown;
  totalMinionsKilled?: unknown;
  neutralMinionsKilled?: unknown;
  goldEarned?: unknown;
  champLevel?: unknown;
  win?: unknown;
  lane?: unknown;
  role?: unknown;
};

type RiotMatchResponse = {
  metadata?: {
    matchId?: unknown;
  };
  info?: {
    gameCreation?: unknown;
    gameDuration?: unknown;
    queueId?: unknown;
    gameMode?: unknown;
    gameType?: unknown;
    mapId?: unknown;
    participants?: unknown;
  };
};

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function buildRiotErrorCode(status: number, path: string): string {
  if (status === 404 && path.startsWith("/riot/account/")) {
    return "riot_account_not_found";
  }
  if (status === 401 || status === 403) {
    return "riot_auth_failed";
  }
  if (status === 429) {
    return "riot_rate_limited";
  }
  if (status >= 500) {
    return "riot_upstream_error";
  }
  return "riot_request_failed";
}

export class RiotApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    code: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "RiotApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function getLeagueApiHosts(region: LeagueRegion): LeagueApiHosts {
  return REGION_HOSTS[region];
}

export function queueTypeForRankPreference(
  rankPreference: LeagueRankPreference,
): string {
  return rankPreference === "flex" ? "RANKED_FLEX_SR" : "RANKED_SOLO_5x5";
}

const _riot429Retries = Math.floor(Number(process.env.RIOT_429_MAX_RETRIES ?? "12"));
const RIOT_429_MAX_ATTEMPTS = Math.max(
  3,
  Math.min(20, Number.isFinite(_riot429Retries) ? _riot429Retries : 12),
);

/**
 * All Riot calls go through here. On 429 we wait for `Retry-After` (or exponential backoff)
 * and retry. Production match-v5 allows 2000/10 s; personal dev keys hit lower app-wide limits sooner.
 */
async function riotRequest<T>(apiKey: string, url: string): Promise<T> {
  const path = new URL(url).pathname;

  for (let attempt = 0; attempt < RIOT_429_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    if (res.status === 429) {
      const bodyText = await res.text();
      const retryAfterHdr = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      if (attempt >= RIOT_429_MAX_ATTEMPTS - 1) {
        throw new RiotApiError(
          `Riot API request failed: 429 ${bodyText || res.statusText}`,
          429,
          buildRiotErrorCode(429, path),
          Number.isFinite(retryAfterHdr) && retryAfterHdr > 0 ? retryAfterHdr : null,
        );
      }
      const baseWaitMs =
        Number.isFinite(retryAfterHdr) && retryAfterHdr > 0
          ? retryAfterHdr * 1000
          : Math.min(90_000, 1200 * 2 ** attempt);
      const jitterMs = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, baseWaitMs + jitterMs));
      continue;
    }

    if (!res.ok) {
      const bodyText = await res.text();
      throw new RiotApiError(
        `Riot API request failed: ${res.status} ${bodyText || res.statusText}`,
        res.status,
        buildRiotErrorCode(res.status, path),
        Number.parseInt(res.headers.get("retry-after") ?? "", 10) || null,
      );
    }

    return res.json() as Promise<T>;
  }

  throw new RiotApiError(
    "Riot API: rate limit (max retries exceeded)",
    429,
    buildRiotErrorCode(429, path),
    null,
  );
}

function normalizeLeagueEntry(
  raw: RiotLeagueEntryResponse,
): LeagueRankedEntry {
  return {
    queueType: asString(raw.queueType),
    tier: asString(raw.tier),
    rank: asString(raw.rank),
    leaguePoints: asFiniteNumber(raw.leaguePoints),
    wins: asFiniteNumber(raw.wins),
    losses: asFiniteNumber(raw.losses),
    hotStreak: raw.hotStreak === true,
  };
}

function normalizeMatchParticipant(
  matchId: string,
  gameCreation: number,
  gameDurationSeconds: number,
  queueId: number,
  gameMode: string,
  gameType: string,
  mapId: number,
  raw: RiotMatchParticipantResponse,
): LeagueRecentMatch {
  return {
    matchId,
    gameCreation,
    gameDurationSeconds,
    queueId,
    gameMode,
    gameType,
    mapId,
    championName: asString(raw.championName, "Unknown"),
    kills: asFiniteNumber(raw.kills),
    deaths: asFiniteNumber(raw.deaths),
    assists: asFiniteNumber(raw.assists),
    totalCs:
      asFiniteNumber(raw.totalMinionsKilled) +
      asFiniteNumber(raw.neutralMinionsKilled),
    goldEarned: asFiniteNumber(raw.goldEarned),
    championLevel: asFiniteNumber(raw.champLevel),
    win: raw.win === true,
    lane: asString(raw.lane, "UNKNOWN"),
    role: asString(raw.role, "UNKNOWN"),
    participantName: asString(raw.riotIdGameName, "Unknown"),
  };
}

export function leagueRecentMatchForPuuid(
  rawMatch: RiotMatchResponse,
  puuid: string,
): LeagueRecentMatch | null {
  const matchIdStr = asString(rawMatch.metadata?.matchId);
  const info = rawMatch.info;
  if (!matchIdStr || !info || !Array.isArray(info.participants)) return null;
  const participant = (info.participants as RiotMatchParticipantResponse[]).find(
    (p) => p.puuid === puuid,
  );
  if (!participant) return null;
  return normalizeMatchParticipant(
    matchIdStr,
    asFiniteNumber(info.gameCreation),
    asFiniteNumber(info.gameDuration),
    asFiniteNumber(info.queueId),
    asString(info.gameMode, ""),
    asString(info.gameType, ""),
    asFiniteNumber(info.mapId),
    participant,
  );
}

export async function resolvePuuid(
  apiKey: string,
  regionalBaseUrl: string,
  gameName: string,
  tagLine: string,
): Promise<RiotAccount> {
  return riotRequest<RiotAccount>(
    apiKey,
    `${regionalBaseUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
}

export async function fetchRankedEntries(
  apiKey: string,
  platformBaseUrl: string,
  puuid: string,
): Promise<LeagueRankedEntry[]> {
  const raw = await riotRequest<RiotLeagueEntryResponse[]>(
    apiKey,
    `${platformBaseUrl}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
  );
  return raw.map(normalizeLeagueEntry);
}

export async function fetchRecentMatchIds(
  apiKey: string,
  regionalBaseUrl: string,
  puuid: string,
  count: number,
  start = 0,
  type?: MatchV5MatchListType,
): Promise<string[]> {
  const pageSize = Math.min(
    Math.max(1, Math.floor(count)),
    MATCH_V5_PUUID_IDS_MAX_COUNT,
  );
  const params = new URLSearchParams({
    start: String(Math.max(0, Math.floor(start))),
    count: String(pageSize),
  });
  if (type) {
    params.set("type", type);
  }
  return riotRequest<string[]>(
    apiKey,
    `${regionalBaseUrl}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`,
  );
}

/**
 * Paginate match ID listing until `maxTotal` IDs, a short page, or Riot history cap.
 * Omit `type` to include all queue types Riot returns (incl. many custom / special queues).
 */
export async function fetchMatchIdsForPlayer(params: {
  apiKey: string;
  regionalBaseUrl: string;
  puuid: string;
  maxTotal: number;
  type?: MatchV5MatchListType;
  /** Delay between paginated match-list calls (rate limits). */
  delayBetweenPagesMs?: number;
}): Promise<string[]> {
  const {
    apiKey,
    regionalBaseUrl,
    puuid,
    maxTotal,
    type,
    delayBetweenPagesMs = 0,
  } = params;
  const cap = Math.min(
    Math.max(1, Math.floor(maxTotal)),
    MATCH_V5_PUUID_IDS_HISTORY_CAP,
  );
  const ids: string[] = [];
  let start = 0;
  while (ids.length < cap && start < MATCH_V5_PUUID_IDS_HISTORY_CAP) {
    if (start > 0 && delayBetweenPagesMs > 0) {
      await new Promise((r) => setTimeout(r, delayBetweenPagesMs));
    }
    const pageSize = Math.min(MATCH_V5_PUUID_IDS_MAX_COUNT, cap - ids.length);
    const batch = await fetchRecentMatchIds(
      apiKey,
      regionalBaseUrl,
      puuid,
      pageSize,
      start,
      type,
    );
    if (batch.length === 0) break;
    ids.push(...batch);
    start += batch.length;
    if (batch.length < pageSize) break;
  }
  return ids;
}

/**
 * @param delayBetweenPagesMs optional pause between match-list pages when `count` &gt; 100.
 */
export async function fetchAllMatchIds(
  apiKey: string,
  regionalBaseUrl: string,
  puuid: string,
  count: number,
  delayBetweenPagesMs = 0,
): Promise<string[]> {
  return fetchMatchIdsForPlayer({
    apiKey,
    regionalBaseUrl,
    puuid,
    maxTotal: count,
    delayBetweenPagesMs,
  });
}

export async function fetchMatch(
  apiKey: string,
  regionalBaseUrl: string,
  matchId: string,
): Promise<RiotMatchResponse> {
  return riotRequest<RiotMatchResponse>(
    apiKey,
    `${regionalBaseUrl}/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
  );
}

/**
 * Fetch only matches that are NOT in knownMatchIds, up to `count` total candidates.
 * Minimises API calls when syncing users who were recently synced.
 */
export async function fetchNewMatches(params: {
  apiKey: string;
  region: LeagueRegion;
  puuid: string;
  knownMatchIds: Set<string>;
  count?: number;
  delayBetweenPagesMs?: number;
  /** When set, skips a second match-list fetch (use with league-auto-sync). */
  prefetchedMatchIds?: string[];
}): Promise<LeagueRecentMatch[]> {
  const {
    apiKey,
    region,
    puuid,
    knownMatchIds,
    count = 20,
    delayBetweenPagesMs = 0,
    prefetchedMatchIds,
  } = params;
  const hosts = getLeagueApiHosts(region);

  const allIds =
    prefetchedMatchIds ??
    (await fetchAllMatchIds(
      apiKey,
      hosts.regionalBaseUrl,
      puuid,
      count,
      delayBetweenPagesMs,
    ));
  const newIds = allIds.filter((id) => !knownMatchIds.has(id));
  if (newIds.length === 0) return [];

  const results: LeagueRecentMatch[] = [];
  for (const matchId of newIds) {
    const rawMatch = await fetchMatch(apiKey, hosts.regionalBaseUrl, matchId);
    const row = leagueRecentMatchForPuuid(rawMatch, puuid);
    if (row) results.push(row);
  }
  return results;
}

export async function fetchLeaguePlayerSnapshot(params: {
  apiKey: string;
  region: LeagueRegion;
  riotId: string;
  tagLine: string;
  rankPreference: LeagueRankPreference;
  matchCount?: number;
}): Promise<LeaguePlayerSnapshot> {
  const {
    apiKey,
    region,
    riotId,
    tagLine,
    rankPreference,
    matchCount = 5,
  } = params;
  const hosts = getLeagueApiHosts(region);
  const account = await resolvePuuid(
    apiKey,
    hosts.regionalBaseUrl,
    riotId,
    tagLine,
  );

  const [leagueEntries, matchIds] = await Promise.all([
    fetchRankedEntries(apiKey, hosts.platformBaseUrl, account.puuid),
    fetchMatchIdsForPlayer({
      apiKey,
      regionalBaseUrl: hosts.regionalBaseUrl,
      puuid: account.puuid,
      maxTotal: matchCount,
    }),
  ]);

  const rawMatches = await Promise.all(
    matchIds.map((matchId) => fetchMatch(apiKey, hosts.regionalBaseUrl, matchId)),
  );

  const recentMatches = rawMatches.flatMap((rawMatch) => {
    const row = leagueRecentMatchForPuuid(rawMatch, account.puuid);
    return row ? [row] : [];
  });

  return {
    fetchedAt: new Date().toISOString(),
    account,
    rankPreference,
    preferredRank:
      leagueEntries.find(
        (entry) => entry.queueType === queueTypeForRankPreference(rankPreference),
      ) ?? null,
    leagueEntries,
    recentMatches,
  };
}
