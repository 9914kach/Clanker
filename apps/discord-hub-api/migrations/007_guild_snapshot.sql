-- Guild snapshot: members, presences, roles, channels
-- Written by the discord-bot process; rebuilt on every bot startup and kept live via events.
-- Requires privileged intents: GUILD_MEMBERS + GUILD_PRESENCES.

-- ── Roles ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bot.guild_roles (
  guild_id    TEXT    NOT NULL,
  role_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  color       INT     NOT NULL DEFAULT 0,
  hoist       BOOLEAN NOT NULL DEFAULT FALSE,   -- shown separately in member list
  position    INT     NOT NULL DEFAULT 0,
  permissions TEXT    NOT NULL DEFAULT '0',     -- bitfield as string (can exceed JS int)
  managed     BOOLEAN NOT NULL DEFAULT FALSE,   -- managed by an integration
  mentionable BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (guild_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_roles_guild_id ON bot.guild_roles (guild_id);

-- ── Channels ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bot.guild_channels (
  guild_id    TEXT    NOT NULL,
  channel_id  TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  type        INT     NOT NULL,   -- Discord ChannelType enum value
  parent_id   TEXT    NULL,       -- category channel id
  position    INT     NULL,
  topic       TEXT    NULL,       -- text/announcement channels only
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_channels_guild_id ON bot.guild_channels (guild_id);

-- ── Members ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bot.guild_members (
  guild_id     TEXT        NOT NULL,
  user_id      TEXT        NOT NULL,
  username     TEXT        NOT NULL,
  global_name  TEXT        NULL,     -- display name set by user across Discord
  nickname     TEXT        NULL,     -- server-specific nickname
  avatar       TEXT        NULL,     -- user avatar hash
  guild_avatar TEXT        NULL,     -- server-specific avatar override
  roles        TEXT[]      NOT NULL DEFAULT '{}',
  is_bot       BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at    TIMESTAMPTZ NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_members_guild_id ON bot.guild_members (guild_id);

-- ── Presences ────────────────────────────────────────────────────────────────
-- One row per online/idle/dnd user. Rows are removed when users go offline.
-- client_status: { desktop, mobile, web } — which clients are active.
-- activities: array of activity objects (games, Spotify, streaming, custom status…).

CREATE TABLE IF NOT EXISTS bot.guild_presences (
  guild_id      TEXT        NOT NULL,
  user_id       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'offline',  -- online | idle | dnd | offline
  client_status JSONB       NOT NULL DEFAULT '{}',
  activities    JSONB       NOT NULL DEFAULT '[]',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_presences_guild_id ON bot.guild_presences (guild_id);

-- ── Migration record ─────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
SELECT '007_guild_snapshot'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '007_guild_snapshot');
