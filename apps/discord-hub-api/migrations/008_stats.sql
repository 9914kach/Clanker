-- Historical stats schema: voice sessions, activity sessions, message log, League history.
-- All tables are append-only logs — rows are never deleted, only updated with end timestamps.

CREATE SCHEMA IF NOT EXISTS stats;

-- ── Voice sessions ────────────────────────────────────────────────────────────
-- One row per voice channel visit. left_at = NULL means the user is still connected.
-- On bot restart, all open sessions (left_at IS NULL) are closed before new ones are opened.

CREATE TABLE IF NOT EXISTS stats.voice_sessions (
  id           BIGSERIAL   PRIMARY KEY,
  guild_id     TEXT        NOT NULL,
  user_id      TEXT        NOT NULL,
  channel_id   TEXT        NOT NULL,
  channel_name TEXT        NULL,
  username     TEXT        NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_guild_user
  ON stats.voice_sessions (guild_id, user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_open
  ON stats.voice_sessions (guild_id, user_id) WHERE left_at IS NULL;

-- ── Activity sessions ─────────────────────────────────────────────────────────
-- One row per activity window (game session, Spotify listen, stream).
-- Tracked activity types: 0=Playing, 1=Streaming, 2=Listening.
-- ended_at = NULL means the activity is still ongoing.

CREATE TABLE IF NOT EXISTS stats.activity_sessions (
  id            BIGSERIAL   PRIMARY KEY,
  guild_id      TEXT        NOT NULL,
  user_id       TEXT        NOT NULL,
  username      TEXT        NOT NULL,
  activity_type INT         NOT NULL,
  activity_name TEXT        NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_guild_user
  ON stats.activity_sessions (guild_id, user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_open
  ON stats.activity_sessions (guild_id, user_id, activity_type, activity_name)
  WHERE ended_at IS NULL;

-- ── Message log ───────────────────────────────────────────────────────────────
-- One row per Discord message. Requires GuildMessages + MessageContent privileged intents.
-- content is stored as-is (personal/private server use).

CREATE TABLE IF NOT EXISTS stats.message_log (
  message_id       TEXT        PRIMARY KEY,
  guild_id         TEXT        NOT NULL,
  channel_id       TEXT        NOT NULL,
  user_id          TEXT        NOT NULL,
  username         TEXT        NOT NULL,
  content          TEXT        NOT NULL DEFAULT '',
  attachment_count INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_log_guild_channel
  ON stats.message_log (guild_id, channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_log_guild_user
  ON stats.message_log (guild_id, user_id, created_at DESC);

-- ── League match history ──────────────────────────────────────────────────────
-- One row per match per player, extracted from Riot API syncs.
-- queue_id reference: 420=Solo/Duo, 440=Flex, 450=ARAM, 490=Quickplay, 0=Custom.

CREATE TABLE IF NOT EXISTS stats.league_matches (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  puuid           TEXT        NOT NULL,
  match_id        TEXT        NOT NULL,
  queue_id        INT         NOT NULL,
  champion        TEXT        NOT NULL,
  kills           INT         NOT NULL DEFAULT 0,
  deaths          INT         NOT NULL DEFAULT 0,
  assists         INT         NOT NULL DEFAULT 0,
  cs              INT         NOT NULL DEFAULT 0,
  gold_earned     INT         NOT NULL DEFAULT 0,
  champion_level  INT         NOT NULL DEFAULT 1,
  win             BOOLEAN     NOT NULL,
  duration_sec    INT         NOT NULL DEFAULT 0,
  lane            TEXT        NOT NULL DEFAULT 'UNKNOWN',
  role            TEXT        NOT NULL DEFAULT 'UNKNOWN',
  played_at       TIMESTAMPTZ NOT NULL,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_league_matches_user
  ON stats.league_matches (user_id, played_at DESC);

-- ── League rank history ───────────────────────────────────────────────────────
-- One row per sync per queue type. Lets you chart LP/tier over time.

CREATE TABLE IF NOT EXISTS stats.league_rank_history (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        TEXT        NOT NULL,
  puuid          TEXT        NOT NULL,
  queue_type     TEXT        NOT NULL,
  tier           TEXT        NOT NULL,
  rank           TEXT        NOT NULL,
  lp             INT         NOT NULL,
  wins           INT         NOT NULL,
  losses         INT         NOT NULL,
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_rank_history_user
  ON stats.league_rank_history (user_id, queue_type, snapshotted_at DESC);

-- ── Migration record ──────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
SELECT '008_stats'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '008_stats');
