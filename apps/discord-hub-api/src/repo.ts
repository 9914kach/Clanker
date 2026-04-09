import { getPool } from "./db.js";
import type { LeaguePlayerSnapshot, LeagueRecentMatch, LeagueRankedEntry } from "./riot-lol.js";
import type { SessionPayload } from "./session.js";

export type ProfileRow = {
  user_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  banner: string | null;
  accent_color: number | null;
  visibility: "public" | "private";
};

export type LeagueConnectionRow = {
  id: number;
  user_id: string;
  riot_id: string;
  tag_line: string;
  region: "EUW" | "EUNE" | "NA" | "KR" | "BR";
  auto_sync: boolean;
  rank_preference: "solo" | "flex";
  status_message: string;
  linked_at: string;
  last_sync_requested_at: string | null;
  puuid: string | null;
};

export async function upsertProfileFromSession(
  session: SessionPayload,
  visibility: "public" | "private" = "public",
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    return;
  }
  await pool.query(
    `
    INSERT INTO profile.profiles (user_id, username, global_name, avatar, banner, accent_color, visibility)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (user_id) DO UPDATE SET
      username = EXCLUDED.username,
      global_name = EXCLUDED.global_name,
      avatar = EXCLUDED.avatar,
      banner = EXCLUDED.banner,
      accent_color = EXCLUDED.accent_color,
      visibility = COALESCE(profile.profiles.visibility, EXCLUDED.visibility)
    `,
    [
      session.sub,
      session.username,
      session.global_name,
      session.avatar,
      session.banner,
      session.accent_color,
      visibility,
    ],
  );
}

export async function getProfileById(
  userId: string,
): Promise<ProfileRow | null> {
  const pool = getPool();
  if (!pool) {
    return null;
  }
  const r = await pool.query<ProfileRow>(
    `SELECT user_id, username, global_name, avatar, banner, accent_color, visibility
     FROM profile.profiles WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function upsertLeagueConnection(
  userId: string,
  data: Omit<LeagueConnectionRow, "id" | "user_id">,
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    return;
  }
  await pool.query(
    `
    INSERT INTO profile.league_connections
      (user_id, riot_id, tag_line, region, auto_sync, rank_preference, status_message, linked_at, last_sync_requested_at, puuid)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (user_id, riot_id, tag_line) DO UPDATE SET
      region = EXCLUDED.region,
      auto_sync = EXCLUDED.auto_sync,
      rank_preference = EXCLUDED.rank_preference,
      status_message = EXCLUDED.status_message,
      linked_at = EXCLUDED.linked_at,
      last_sync_requested_at = EXCLUDED.last_sync_requested_at,
      puuid = COALESCE(EXCLUDED.puuid, profile.league_connections.puuid)
    `,
    [
      userId,
      data.riot_id,
      data.tag_line,
      data.region,
      data.auto_sync,
      data.rank_preference,
      data.status_message,
      data.linked_at,
      data.last_sync_requested_at,
      data.puuid ?? null,
    ],
  );
}

function normalizeConnectionRow(row: {
  id: number;
  user_id: string;
  riot_id: string;
  tag_line: string;
  region: "EUW" | "EUNE" | "NA" | "KR" | "BR";
  auto_sync: boolean;
  rank_preference: "solo" | "flex";
  status_message: string;
  linked_at: string;
  last_sync_requested_at: string | null;
  puuid: string | null;
}): LeagueConnectionRow {
  return {
    ...row,
    linked_at: new Date(String(row.linked_at)).toISOString(),
    last_sync_requested_at: row.last_sync_requested_at
      ? new Date(String(row.last_sync_requested_at)).toISOString()
      : null,
  };
}

/** Returns all League accounts linked to a user. */
export async function getLeagueConnections(
  userId: string,
): Promise<LeagueConnectionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<LeagueConnectionRow>(
    `SELECT id, user_id, riot_id, tag_line, region, auto_sync, rank_preference, status_message,
            linked_at::timestamptz as linked_at,
            last_sync_requested_at::timestamptz as last_sync_requested_at,
            puuid
       FROM profile.league_connections
      WHERE user_id = $1
      ORDER BY linked_at ASC`,
    [userId],
  );
  return r.rows.map(normalizeConnectionRow);
}

/** Returns the first linked League account for a user, or null. */
export async function getLeagueConnection(
  userId: string,
): Promise<LeagueConnectionRow | null> {
  const rows = await getLeagueConnections(userId);
  return rows[0] ?? null;
}

/** Delete a specific account by riot_id + tag_line. */
export async function deleteLeagueConnectionByAccount(
  userId: string,
  riotId: string,
  tagLine: string,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `DELETE FROM profile.league_connections
      WHERE user_id = $1 AND riot_id = $2 AND tag_line = $3`,
    [userId, riotId, tagLine],
  );
}

export async function getAllLeagueConnections(): Promise<LeagueConnectionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<LeagueConnectionRow>(
    `SELECT id, user_id, riot_id, tag_line, region, auto_sync, rank_preference,
            status_message, linked_at::text, last_sync_requested_at::text, puuid
     FROM profile.league_connections`,
  );
  return r.rows;
}

export async function getKnownMatchIds(
  userId: string,
  puuid: string,
  candidateIds: string[],
): Promise<Set<string>> {
  const pool = getPool();
  if (!pool || candidateIds.length === 0) return new Set();
  const r = await pool.query<{ match_id: string }>(
    `SELECT match_id FROM stats.league_matches
     WHERE user_id = $1 AND puuid = $2 AND match_id = ANY($3::text[])`,
    [userId, puuid, candidateIds],
  );
  return new Set(r.rows.map((row) => row.match_id));
}

type LeagueMatchRowDb = {
  match_id: string;
  queue_id: number;
  game_mode: string;
  game_type: string;
  map_id: number;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold_earned: number;
  champion_level: number;
  win: boolean;
  duration_sec: number;
  lane: string;
  role: string;
  played_at: Date;
};

function leagueRecentMatchFromDbRow(
  row: LeagueMatchRowDb,
  participantLabel: string,
): LeagueRecentMatch {
  const played =
    row.played_at instanceof Date
      ? row.played_at.getTime()
      : new Date(String(row.played_at)).getTime();
  return {
    matchId: row.match_id,
    gameCreation: Number.isFinite(played) ? played : 0,
    gameDurationSeconds: row.duration_sec,
    queueId: row.queue_id,
    gameMode: row.game_mode,
    gameType: row.game_type,
    mapId: row.map_id,
    championName: row.champion,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    totalCs: row.cs,
    goldEarned: row.gold_earned,
    championLevel: row.champion_level,
    win: row.win,
    lane: row.lane,
    role: row.role,
    participantName: participantLabel,
  };
}

/** Load stored match rows for snapshot/UI (e.g. recent list already in DB). */
export async function getLeagueRecentMatchesByMatchIds(
  userId: string,
  puuid: string,
  matchIds: string[],
  participantLabel: string,
): Promise<Map<string, LeagueRecentMatch>> {
  const pool = getPool();
  const out = new Map<string, LeagueRecentMatch>();
  if (!pool || matchIds.length === 0) return out;
  const r = await pool.query<LeagueMatchRowDb>(
    `SELECT match_id, queue_id, game_mode, game_type, map_id, champion, kills, deaths, assists,
            cs, gold_earned, champion_level, win, duration_sec, lane, role, played_at
       FROM stats.league_matches
      WHERE user_id = $1 AND puuid = $2 AND match_id = ANY($3::text[])`,
    [userId, puuid, matchIds],
  );
  for (const row of r.rows) {
    out.set(row.match_id, leagueRecentMatchFromDbRow(row, participantLabel));
  }
  return out;
}

/** Delete ALL League connections for a user (used when unlinking everything). */
export async function deleteLeagueConnection(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`DELETE FROM profile.league_connections WHERE user_id = $1`, [userId]);
}

export async function upsertLeagueSnapshot(
  userId: string,
  snapshot: LeaguePlayerSnapshot,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  const puuid = snapshot.account.puuid;
  await pool.query(
    `
    INSERT INTO profile.league_snapshots (user_id, puuid, payload, fetched_at)
    VALUES ($1, $2, $3::jsonb, $4)
    ON CONFLICT (user_id, puuid) DO UPDATE SET
      payload = EXCLUDED.payload,
      fetched_at = EXCLUDED.fetched_at
    `,
    [userId, puuid, JSON.stringify(snapshot), snapshot.fetchedAt],
  );
}

/** Get snapshot for a specific puuid, or most-recently-fetched if puuid omitted. */
export async function getLeagueSnapshot(
  userId: string,
  puuid?: string,
): Promise<LeaguePlayerSnapshot | null> {
  const pool = getPool();
  if (!pool) return null;
  const r = puuid
    ? await pool.query<{ payload: any }>(
        `SELECT payload FROM profile.league_snapshots WHERE user_id = $1 AND puuid = $2`,
        [userId, puuid],
      )
    : await pool.query<{ payload: any }>(
        `SELECT payload FROM profile.league_snapshots WHERE user_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
        [userId],
      );
  const row = r.rows[0];
  if (!row) return null;
  return row.payload as LeaguePlayerSnapshot;
}

/** Get all snapshots for a user (one per linked account). */
export async function getAllLeagueSnapshots(
  userId: string,
): Promise<LeaguePlayerSnapshot[]> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<{ payload: any }>(
    `SELECT payload FROM profile.league_snapshots WHERE user_id = $1 ORDER BY fetched_at DESC`,
    [userId],
  );
  return r.rows.map((row) => row.payload as LeaguePlayerSnapshot);
}

/** Delete snapshot for a specific puuid. */
export async function deleteLeagueSnapshotByPuuid(
  userId: string,
  puuid: string,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `DELETE FROM profile.league_snapshots WHERE user_id = $1 AND puuid = $2`,
    [userId, puuid],
  );
}

/** Delete ALL snapshots for a user. */
export async function deleteLeagueSnapshot(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`DELETE FROM profile.league_snapshots WHERE user_id = $1`, [userId]);
}

/** Upsert individual match rows into stats.league_matches (ignores duplicates). */
export async function saveLeagueMatches(
  userId: string,
  puuid: string,
  matches: LeagueRecentMatch[],
): Promise<void> {
  const pool = getPool();
  if (!pool || matches.length === 0) return;

  for (const m of matches) {
    await pool.query(
      `INSERT INTO stats.league_matches
         (user_id, puuid, match_id, queue_id, game_mode, game_type, map_id, champion, kills, deaths, assists,
          cs, gold_earned, champion_level, win, duration_sec, lane, role, played_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, to_timestamp($19::double precision / 1000))
       ON CONFLICT (user_id, puuid, match_id) DO NOTHING`,
      [
        userId,
        puuid,
        m.matchId,
        m.queueId,
        m.gameMode,
        m.gameType,
        m.mapId,
        m.championName,
        m.kills,
        m.deaths,
        m.assists,
        m.totalCs,
        m.goldEarned,
        m.championLevel,
        m.win,
        m.gameDurationSeconds,
        m.lane,
        m.role,
        m.gameCreation,
      ],
    );
  }
}

/** Insert a rank snapshot for each queue entry (RANKED_SOLO_5x5, RANKED_FLEX_SR). */
export async function saveLeagueRankHistory(
  userId: string,
  puuid: string,
  entries: LeagueRankedEntry[],
): Promise<void> {
  const pool = getPool();
  if (!pool || entries.length === 0) return;

  for (const e of entries) {
    await pool.query(
      `INSERT INTO stats.league_rank_history
         (user_id, puuid, queue_type, tier, rank, lp, wins, losses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, puuid, e.queueType, e.tier, e.rank, e.leaguePoints, e.wins, e.losses],
    );
  }
}

export type LeagueQueueStat = {
  queueId: number;
  games: number;
  wins: number;
  winRate: number;
};

export type LeagueChampionStat = {
  champion: string;
  games: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCs: number;
};

export type LeagueMatchRow = {
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

export type LeagueMatchStats = {
  totalGames: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCs: number;
  avgDurationSec: number;
  byQueue: LeagueQueueStat[];
  byChampion: LeagueChampionStat[];
};

export type LeagueMatchesPageResult = {
  total: number;
  offset: number;
  limit: number;
  matches: LeagueMatchRow[];
};

export async function getLeagueMatchStats(
  userId: string,
  puuid: string,
): Promise<LeagueMatchStats | null> {
  const pool = getPool();
  if (!pool) return null;

  const [summaryRes, queueRes, championRes] = await Promise.all([
    pool.query<{
      total: string;
      wins: string;
      avg_kills: string;
      avg_deaths: string;
      avg_assists: string;
      avg_cs: string;
      avg_duration: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         SUM(CASE WHEN win THEN 1 ELSE 0 END)::text AS wins,
         AVG(kills)::text AS avg_kills,
         AVG(deaths)::text AS avg_deaths,
         AVG(assists)::text AS avg_assists,
         AVG(cs)::text AS avg_cs,
         AVG(duration_sec)::text AS avg_duration
       FROM stats.league_matches
       WHERE user_id = $1 AND puuid = $2`,
      [userId, puuid],
    ),
    pool.query<{ queue_id: number; games: string; wins: string }>(
      `SELECT
         queue_id,
         COUNT(*)::text AS games,
         SUM(CASE WHEN win THEN 1 ELSE 0 END)::text AS wins
       FROM stats.league_matches
       WHERE user_id = $1 AND puuid = $2
       GROUP BY queue_id
       ORDER BY games DESC`,
      [userId, puuid],
    ),
    pool.query<{
      champion: string;
      games: string;
      wins: string;
      avg_kills: string;
      avg_deaths: string;
      avg_assists: string;
      avg_cs: string;
    }>(
      `SELECT
         champion,
         COUNT(*)::text AS games,
         SUM(CASE WHEN win THEN 1 ELSE 0 END)::text AS wins,
         AVG(kills)::text AS avg_kills,
         AVG(deaths)::text AS avg_deaths,
         AVG(assists)::text AS avg_assists,
         AVG(cs)::text AS avg_cs
       FROM stats.league_matches
       WHERE user_id = $1 AND puuid = $2
       GROUP BY champion
       ORDER BY games DESC
       LIMIT 20`,
      [userId, puuid],
    ),
  ]);

  const s = summaryRes.rows[0];
  if (!s) return null;

  const totalGames = parseInt(s.total, 10);
  const wins = parseInt(s.wins, 10);

  const toFloat = (v: string) => parseFloat(v) || 0;

  return {
    totalGames,
    wins,
    winRate: totalGames > 0 ? Math.round((wins / totalGames) * 1000) / 10 : 0,
    avgKills: Math.round(toFloat(s.avg_kills) * 10) / 10,
    avgDeaths: Math.round(toFloat(s.avg_deaths) * 10) / 10,
    avgAssists: Math.round(toFloat(s.avg_assists) * 10) / 10,
    avgCs: Math.round(toFloat(s.avg_cs)),
    avgDurationSec: Math.round(toFloat(s.avg_duration)),
    byQueue: queueRes.rows.map((r) => {
      const g = parseInt(r.games, 10);
      const w = parseInt(r.wins, 10);
      return {
        queueId: r.queue_id,
        games: g,
        wins: w,
        winRate: g > 0 ? Math.round((w / g) * 1000) / 10 : 0,
      };
    }),
    byChampion: championRes.rows.map((r) => {
      const g = parseInt(r.games, 10);
      const w = parseInt(r.wins, 10);
      return {
        champion: r.champion,
        games: g,
        wins: w,
        winRate: g > 0 ? Math.round((w / g) * 1000) / 10 : 0,
        avgKills: Math.round(toFloat(r.avg_kills) * 10) / 10,
        avgDeaths: Math.round(toFloat(r.avg_deaths) * 10) / 10,
        avgAssists: Math.round(toFloat(r.avg_assists) * 10) / 10,
        avgCs: Math.round(toFloat(r.avg_cs)),
      };
    }),
  };
}

function mapLeagueMatchRow(r: {
  match_id: string;
  queue_id: number;
  game_mode: string;
  game_type: string;
  map_id: number;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold_earned: number;
  champion_level: number;
  win: boolean;
  duration_sec: number;
  lane: string;
  role: string;
  played_at: string;
}): LeagueMatchRow {
  return {
    matchId: r.match_id,
    queueId: r.queue_id,
    gameMode: r.game_mode ?? "",
    gameType: r.game_type ?? "",
    mapId: r.map_id ?? 0,
    champion: r.champion,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    cs: r.cs,
    goldEarned: r.gold_earned,
    championLevel: r.champion_level,
    win: r.win,
    durationSec: r.duration_sec,
    lane: r.lane,
    role: r.role,
    playedAt: new Date(String(r.played_at)).toISOString(),
  };
}

/** Paginated match history (newest first). */
export async function getLeagueMatchesPage(
  userId: string,
  puuid: string,
  offset: number,
  limit: number,
): Promise<LeagueMatchesPageResult | null> {
  const pool = getPool();
  if (!pool) return null;

  const countRes = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM stats.league_matches WHERE user_id = $1 AND puuid = $2`,
    [userId, puuid],
  );
  const total = parseInt(countRes.rows[0]?.c ?? "0", 10);

  const dataRes = await pool.query<{
    match_id: string;
    queue_id: number;
    game_mode: string;
    game_type: string;
    map_id: number;
    champion: string;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    gold_earned: number;
    champion_level: number;
    win: boolean;
    duration_sec: number;
    lane: string;
    role: string;
    played_at: string;
  }>(
    `SELECT
       match_id, queue_id, game_mode, game_type, map_id, champion, kills, deaths, assists,
       cs, gold_earned, champion_level, win, duration_sec, lane, role,
       played_at::timestamptz AS played_at
     FROM stats.league_matches
     WHERE user_id = $1 AND puuid = $2
     ORDER BY played_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, puuid, limit, offset],
  );

  return {
    total,
    offset,
    limit,
    matches: dataRes.rows.map(mapLeagueMatchRow),
  };
}

export type WheelGroupRow = {
  id: string;
  owner_user_id: string;
  name: string;
  participants: any;
  created_at: string;
  updated_at: string;
};

export type WheelSessionRow = {
  id: string;
  owner_user_id: string;
  group_id: string | null;
  seed: string | null;
  team_count: number;
  team_mode: "balanced" | "equal";
  participants: any;
  winner: string | null;
  teams: any;
  created_at: string;
};

export async function listWheelGroups(
  ownerUserId: string,
): Promise<Array<Pick<WheelGroupRow, "id" | "name" | "participants" | "created_at" | "updated_at">>> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<
    Pick<WheelGroupRow, "id" | "name" | "participants" | "created_at" | "updated_at">
  >(
    `
    SELECT id, name, participants, created_at::timestamptz as created_at, updated_at::timestamptz as updated_at
      FROM hub.wheel_groups
     WHERE owner_user_id = $1
     ORDER BY updated_at DESC
     LIMIT 50
    `,
    [ownerUserId],
  );
  return r.rows.map((row) => ({
    ...row,
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  }));
}

export async function getWheelGroup(
  ownerUserId: string,
  id: string,
): Promise<Pick<WheelGroupRow, "id" | "name" | "participants" | "created_at" | "updated_at"> | null> {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query<
    Pick<WheelGroupRow, "id" | "name" | "participants" | "created_at" | "updated_at">
  >(
    `
    SELECT id, name, participants, created_at::timestamptz as created_at, updated_at::timestamptz as updated_at
      FROM hub.wheel_groups
     WHERE owner_user_id = $1 AND id = $2
     LIMIT 1
    `,
    [ownerUserId, id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createWheelGroup(params: {
  id: string;
  ownerUserId: string;
  name: string;
  participants: string[];
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `
    INSERT INTO hub.wheel_groups (id, owner_user_id, name, participants)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [params.id, params.ownerUserId, params.name, JSON.stringify(params.participants)],
  );
}

export async function updateWheelGroup(params: {
  id: string;
  ownerUserId: string;
  name: string;
  participants: string[];
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const r = await pool.query(
    `
    UPDATE hub.wheel_groups
       SET name = $3,
           participants = $4::jsonb
     WHERE owner_user_id = $1 AND id = $2
    `,
    [params.ownerUserId, params.id, params.name, JSON.stringify(params.participants)],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function deleteWheelGroup(
  ownerUserId: string,
  id: string,
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const r = await pool.query(
    `DELETE FROM hub.wheel_groups WHERE owner_user_id = $1 AND id = $2`,
    [ownerUserId, id],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function createWheelSession(params: {
  id: string;
  ownerUserId: string;
  groupId: string | null;
  seed: string | null;
  teamCount: number;
  teamMode: "balanced" | "equal";
  participants: string[];
  winner: string | null;
  teams: string[][];
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `
    INSERT INTO hub.wheel_sessions
      (id, owner_user_id, group_id, seed, team_count, team_mode, participants, winner, teams)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb)
    `,
    [
      params.id,
      params.ownerUserId,
      params.groupId,
      params.seed,
      params.teamCount,
      params.teamMode,
      JSON.stringify(params.participants),
      params.winner,
      JSON.stringify(params.teams),
    ],
  );
}

export async function listRecentWheelSessions(
  ownerUserId: string,
  limit: number,
): Promise<
  Array<
    Pick<
      WheelSessionRow,
      | "id"
      | "group_id"
      | "seed"
      | "team_count"
      | "team_mode"
      | "participants"
      | "winner"
      | "teams"
      | "created_at"
    >
  >
> {
  const pool = getPool();
  if (!pool) return [];
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const r = await pool.query<
    Pick<
      WheelSessionRow,
      | "id"
      | "group_id"
      | "seed"
      | "team_count"
      | "team_mode"
      | "participants"
      | "winner"
      | "teams"
      | "created_at"
    >
  >(
    `
    SELECT id, group_id, seed, team_count, team_mode, participants, winner, teams,
           created_at::timestamptz as created_at
      FROM hub.wheel_sessions
     WHERE owner_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2
    `,
    [ownerUserId, safeLimit],
  );
  return r.rows.map((row) => ({
    ...row,
    created_at: new Date(String(row.created_at)).toISOString(),
  }));
}

export type HubUserSettingsRow = {
  user_id: string;
  payload: unknown;
  updated_at: string;
};

export async function getHubUserSettings(
  userId: string,
): Promise<HubUserSettingsRow | null> {
  const pool = getPool();
  if (!pool) {
    return null;
  }
  const r = await pool.query<{ payload: unknown; updated_at: Date }>(
    `
    SELECT payload, updated_at
      FROM hub.user_settings
     WHERE user_id = $1
    `,
    [userId],
  );
  const row = r.rows[0];
  if (!row) {
    return null;
  }
  return {
    user_id: userId,
    payload: row.payload,
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function upsertHubUserSettings(
  userId: string,
  payload: unknown,
): Promise<string> {
  const pool = getPool();
  if (!pool) {
    throw new Error("database_unavailable");
  }
  const r = await pool.query<{ updated_at: Date }>(
    `
    INSERT INTO hub.user_settings (user_id, payload, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
    RETURNING updated_at
    `,
    [userId, JSON.stringify(payload ?? {})],
  );
  const updated = r.rows[0]?.updated_at;
  if (!updated) {
    throw new Error("hub_user_settings_upsert_failed");
  }
  return new Date(String(updated)).toISOString();
}
