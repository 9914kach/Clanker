export type LeagueRegion = "EUW" | "EUNE" | "NA" | "KR" | "BR";

export type LeagueRankPreference = "solo" | "flex";

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

async function riotRequest<T>(apiKey: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "X-Riot-Token": apiKey,
    },
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new RiotApiError(
      `Riot API request failed: ${res.status} ${bodyText || res.statusText}`,
      res.status,
      buildRiotErrorCode(res.status, new URL(url).pathname),
      Number.parseInt(res.headers.get("retry-after") ?? "", 10) || null,
    );
  }

  return res.json() as Promise<T>;
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
  raw: RiotMatchParticipantResponse,
): LeagueRecentMatch {
  return {
    matchId,
    gameCreation,
    gameDurationSeconds,
    queueId,
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
): Promise<string[]> {
  return riotRequest<string[]>(
    apiKey,
    `${regionalBaseUrl}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}`,
  );
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
    fetchRecentMatchIds(
      apiKey,
      hosts.regionalBaseUrl,
      account.puuid,
      matchCount,
    ),
  ]);

  const rawMatches = await Promise.all(
    matchIds.map((matchId) => fetchMatch(apiKey, hosts.regionalBaseUrl, matchId)),
  );

  const recentMatches = rawMatches.flatMap((rawMatch) => {
    const matchId = asString(rawMatch.metadata?.matchId);
    const info = rawMatch.info;
    if (!matchId || !info || !Array.isArray(info.participants)) {
      return [];
    }

    const participant = info.participants.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as RiotMatchParticipantResponse;
      return record.puuid === account.puuid;
    }) as RiotMatchParticipantResponse | undefined;

    if (!participant) {
      return [];
    }

    return [
      normalizeMatchParticipant(
        matchId,
        asFiniteNumber(info.gameCreation),
        asFiniteNumber(info.gameDuration),
        asFiniteNumber(info.queueId),
        participant,
      ),
    ];
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
