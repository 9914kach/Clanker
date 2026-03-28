-- Voice state tracking: one row per user per guild while they are in a voice channel.
-- Written by the discord-bot process; read by the API.
-- Rows are cleared on bot restart and rebuilt from the live guild snapshot.

CREATE TABLE IF NOT EXISTS guild_voice_states (
  guild_id      TEXT        NOT NULL,
  user_id       TEXT        NOT NULL,
  channel_id    TEXT        NOT NULL,
  channel_name  TEXT        NULL,
  username      TEXT        NOT NULL,
  global_name   TEXT        NULL,
  avatar        TEXT        NULL,
  is_muted      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_deafened   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_streaming  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_video      BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_voice_states_guild_id
  ON guild_voice_states (guild_id);

CREATE OR REPLACE FUNCTION set_guild_voice_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_guild_voice_states_updated_at'
  ) THEN
    CREATE TRIGGER tr_guild_voice_states_updated_at
    BEFORE UPDATE ON guild_voice_states
    FOR EACH ROW
    EXECUTE FUNCTION set_guild_voice_states_updated_at();
  END IF;
END;
$$;

INSERT INTO schema_migrations (version)
SELECT '004_voice_states'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '004_voice_states');
