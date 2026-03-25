import type { LeaguePlayerSnapshot } from "./riot-lol.js";
import type { SessionPayload } from "./session.js";

export type PublicLeagueProfile = {
  riotId: string;
  tagLine: string;
  region: "EUW" | "EUNE" | "NA" | "KR" | "BR";
  linkedAt: string;
  lastSyncRequestedAt: string | null;
};

export type PublicProfileDTO = {
  user: {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    banner: string | null;
    accent_color: number | null;
  };
  integrations: {
    league: PublicLeagueProfile | null;
    steam: null;
  };
  stats: {
    league: PublicLeagueStatsDTO;
  };
};

export type PublicLeagueStatsDTO =
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
      preferredRank: LeaguePlayerSnapshot["preferredRank"];
      leagueEntries: LeaguePlayerSnapshot["leagueEntries"];
      recentMatches: LeaguePlayerSnapshot["recentMatches"];
      account: { gameName: string; tagLine: string };
    };

export function buildPublicLeagueStats(
  league: PublicLeagueProfile | null,
  snapshot: LeaguePlayerSnapshot | null,
): PublicLeagueStatsDTO {
  const lastSyncRequestedAt = league?.lastSyncRequestedAt ?? null;
  if (!league) {
    return { available: false, source: "not_configured", lastSyncRequestedAt: null };
  }
  if (!snapshot) {
    return { available: false, source: "not_synced", lastSyncRequestedAt };
  }
  return {
    available: true,
    source: "riot_sync",
    lastSyncRequestedAt,
    fetchedAt: snapshot.fetchedAt,
    rankPreference: snapshot.rankPreference,
    preferredRank: snapshot.preferredRank,
    leagueEntries: snapshot.leagueEntries,
    recentMatches: snapshot.recentMatches,
    account: {
      gameName: snapshot.account.gameName,
      tagLine: snapshot.account.tagLine,
    },
  };
}

type ProfileVisibility = "public" | "private";

type ProfileRecord = {
  user: PublicProfileDTO["user"];
  league: PublicLeagueProfile | null;
  visibility: ProfileVisibility;
};

type LeagueConnectionLike = {
  riotId: string;
  tagLine: string;
  region: PublicLeagueProfile["region"];
  linkedAt: string;
  lastSyncRequestedAt: string | null;
};

const profileByUserId = new Map<string, ProfileRecord>();

function toUserProfile(session: SessionPayload): PublicProfileDTO["user"] {
  return {
    id: session.sub,
    username: session.username,
    global_name: session.global_name,
    avatar: session.avatar,
    banner: session.banner,
    accent_color: session.accent_color,
  };
}

function toPublicLeagueProfile(
  connection: LeagueConnectionLike | null,
): PublicLeagueProfile | null {
  if (!connection) {
    return null;
  }

  return {
    riotId: connection.riotId,
    tagLine: connection.tagLine,
    region: connection.region,
    linkedAt: connection.linkedAt,
    lastSyncRequestedAt: connection.lastSyncRequestedAt,
  };
}

export function upsertProfileFromSession(
  session: SessionPayload,
  visibility: ProfileVisibility = "public",
): void {
  const existing = profileByUserId.get(session.sub);
  profileByUserId.set(session.sub, {
    user: toUserProfile(session),
    league: existing?.league ?? null,
    visibility: existing?.visibility ?? visibility,
  });
}

export function setProfileLeague(
  userId: string,
  connection: LeagueConnectionLike | null,
): void {
  const existing = profileByUserId.get(userId);
  if (!existing) {
    return;
  }

  profileByUserId.set(userId, {
    ...existing,
    league: toPublicLeagueProfile(connection),
  });
}

export function getPublicProfile(
  userId: string,
  options?: { leagueSnapshot: LeaguePlayerSnapshot | null },
): PublicProfileDTO | null {
  const record = profileByUserId.get(userId);
  if (!record || record.visibility !== "public") {
    return null;
  }

  const leagueSnapshot = options?.leagueSnapshot ?? null;

  return {
    user: record.user,
    integrations: {
      league: record.league,
      steam: null,
    },
    stats: {
      league: buildPublicLeagueStats(record.league, leagueSnapshot),
    },
  };
}
