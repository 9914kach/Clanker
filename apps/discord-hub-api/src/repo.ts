import { getPool } from "./db.js";
import type { LeaguePlayerSnapshot } from "./riot-lol.js";
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
  user_id: string;
  riot_id: string;
  tag_line: string;
  region: "EUW" | "EUNE" | "NA" | "KR" | "BR";
  auto_sync: boolean;
  rank_preference: "solo" | "flex";
  status_message: string;
  linked_at: string;
  last_sync_requested_at: string | null;
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
    INSERT INTO profiles (user_id, username, global_name, avatar, banner, accent_color, visibility)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (user_id) DO UPDATE SET
      username = EXCLUDED.username,
      global_name = EXCLUDED.global_name,
      avatar = EXCLUDED.avatar,
      banner = EXCLUDED.banner,
      accent_color = EXCLUDED.accent_color,
      visibility = COALESCE(profiles.visibility, EXCLUDED.visibility)
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
     FROM profiles WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function upsertLeagueConnection(
  userId: string,
  data: Omit<LeagueConnectionRow, "user_id">,
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    return;
  }
  await pool.query(
    `
    INSERT INTO league_connections
      (user_id, riot_id, tag_line, region, auto_sync, rank_preference, status_message, linked_at, last_sync_requested_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (user_id) DO UPDATE SET
      riot_id = EXCLUDED.riot_id,
      tag_line = EXCLUDED.tag_line,
      region = EXCLUDED.region,
      auto_sync = EXCLUDED.auto_sync,
      rank_preference = EXCLUDED.rank_preference,
      status_message = EXCLUDED.status_message,
      linked_at = EXCLUDED.linked_at,
      last_sync_requested_at = EXCLUDED.last_sync_requested_at
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
    ],
  );
}

export async function getLeagueConnection(
  userId: string,
): Promise<LeagueConnectionRow | null> {
  const pool = getPool();
  if (!pool) {
    return null;
  }
  const r = await pool.query<
    Omit<LeagueConnectionRow, "linked_at" | "last_sync_requested_at"> & {
      linked_at: string;
      last_sync_requested_at: string | null;
    }
  >(
    `SELECT user_id, riot_id, tag_line, region, auto_sync, rank_preference, status_message,
            linked_at::timestamptz as linked_at,
            last_sync_requested_at::timestamptz as last_sync_requested_at
       FROM league_connections WHERE user_id = $1`,
    [userId],
  );
  // linked_at formatting: we ensure ISO string by using to_char; alternative is cast and let pg return ISO
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    linked_at: new Date(String(row.linked_at)).toISOString(),
    last_sync_requested_at: row.last_sync_requested_at
      ? new Date(String(row.last_sync_requested_at)).toISOString()
      : null,
  };
}

export async function deleteLeagueConnection(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) {
    return;
  }
  await pool.query(`DELETE FROM league_connections WHERE user_id = $1`, [
    userId,
  ]);
}

export async function upsertLeagueSnapshot(
  userId: string,
  snapshot: LeaguePlayerSnapshot,
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    return;
  }
  await pool.query(
    `
    INSERT INTO league_snapshots (user_id, payload, fetched_at)
    VALUES ($1, $2::jsonb, $3)
    ON CONFLICT (user_id) DO UPDATE SET
      payload = EXCLUDED.payload,
      fetched_at = EXCLUDED.fetched_at
    `,
    [userId, JSON.stringify(snapshot), snapshot.fetchedAt],
  );
}

export async function getLeagueSnapshot(
  userId: string,
): Promise<LeaguePlayerSnapshot | null> {
  const pool = getPool();
  if (!pool) {
    return null;
  }
  const r = await pool.query<{ payload: any }>(
    `SELECT payload FROM league_snapshots WHERE user_id = $1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return row.payload as LeaguePlayerSnapshot;
}

export async function deleteLeagueSnapshot(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) {
    return;
  }
  await pool.query(`DELETE FROM league_snapshots WHERE user_id = $1`, [
    userId,
  ]);
}
