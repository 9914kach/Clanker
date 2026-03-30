-- Audit / history of music queue and playback (written by discord-bot)

CREATE TABLE IF NOT EXISTS bot.music_playback_log (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN (
    'queued',
    'play_start',
    'playback_ended',
    'pause',
    'resume',
    'seek'
  )),
  track_url TEXT NULL,
  title TEXT NULL,
  artist TEXT NULL,
  source TEXT NULL,
  duration_sec INT NULL,
  requested_by TEXT NULL,
  channel_id TEXT NULL,
  meta JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT music_playback_log_source_ck CHECK (
    source IS NULL OR source IN ('youtube', 'soundcloud', 'spotify')
  )
);

CREATE INDEX IF NOT EXISTS idx_music_playback_log_guild_created
  ON bot.music_playback_log (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_music_playback_log_requested_created
  ON bot.music_playback_log (requested_by, created_at DESC)
  WHERE requested_by IS NOT NULL;

INSERT INTO public.schema_migrations (version)
SELECT '010_music_playback_log'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '010_music_playback_log');
