import type { LeaguePlayerSnapshot } from "./riot-lol.js";
import type { SessionPayload } from "./session.js";
import {
  getLeagueConnection,
  getLeagueSnapshot,
  getProfileById,
  upsertProfileFromSession as repoUpsertProfileFromSession,
} from "./repo.js";

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

export async function upsertProfileFromSession(
  session: SessionPayload,
  visibility: ProfileVisibility = "public",
): Promise<void> {
  await repoUpsertProfileFromSession(session, visibility);
}

export async function getPublicProfile(
  userId: string,
): Promise<PublicProfileDTO | null> {
  const profile = await getProfileById(userId);
  if (!profile || profile.visibility !== "public") {
    return null;
  }
  const connection = await getLeagueConnection(userId);
  const league: PublicLeagueProfile | null = connection
    ? {
        riotId: connection.riot_id,
        tagLine: connection.tag_line,
        region: connection.region,
        linkedAt: connection.linked_at,
        lastSyncRequestedAt: connection.last_sync_requested_at,
      }
    : null;
  const snapshot = await getLeagueSnapshot(userId);

  return {
    user: {
      id: profile.user_id,
      username: profile.username,
      global_name: profile.global_name,
      avatar: profile.avatar,
      banner: profile.banner,
      accent_color: profile.accent_color,
    },
    integrations: {
      league,
      steam: null,
    },
    stats: {
      league: buildPublicLeagueStats(league, snapshot),
    },
  };
}
