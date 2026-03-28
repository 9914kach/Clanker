-- Music playback state and queue, managed by the Discord bot process

CREATE TABLE IF NOT EXISTS bot.music_now_playing (
  guild_id     TEXT        PRIMARY KEY,
  track_url    TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  artist       TEXT        NULL,
  thumbnail    TEXT        NULL,
  duration_sec INT         NULL,
  source       TEXT        NOT NULL CHECK (source IN ('youtube', 'soundcloud', 'spotify')),
  requested_by TEXT        NOT NULL,
  channel_id   TEXT        NOT NULL,
  is_paused    BOOLEAN     NOT NULL DEFAULT FALSE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot.music_queue (
  id           SERIAL      PRIMARY KEY,
  guild_id     TEXT        NOT NULL,
  track_url    TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  artist       TEXT        NULL,
  thumbnail    TEXT        NULL,
  duration_sec INT         NULL,
  source       TEXT        NOT NULL CHECK (source IN ('youtube', 'soundcloud', 'spotify')),
  requested_by TEXT        NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_queue_guild_added
  ON bot.music_queue (guild_id, added_at);

CREATE OR REPLACE FUNCTION bot.set_music_now_playing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_music_now_playing_updated_at'
  ) THEN
    CREATE TRIGGER tr_music_now_playing_updated_at
    BEFORE UPDATE ON bot.music_now_playing
    FOR EACH ROW
    EXECUTE FUNCTION bot.set_music_now_playing_updated_at();
  END IF;
END;
$$;

INSERT INTO public.schema_migrations (version)
SELECT '006_music'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '006_music');
