-- Named playlists managed by the Discord bot

CREATE TABLE IF NOT EXISTS bot.playlists (
  id          SERIAL      PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, name)
);

CREATE TABLE IF NOT EXISTS bot.playlist_tracks (
  id           SERIAL      PRIMARY KEY,
  playlist_id  INT         NOT NULL REFERENCES bot.playlists(id) ON DELETE CASCADE,
  position     INT         NOT NULL,
  track_url    TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  artist       TEXT        NULL,
  thumbnail    TEXT        NULL,
  duration_sec INT         NULL,
  source       TEXT        NOT NULL CHECK (source IN ('youtube', 'soundcloud', 'spotify')),
  added_by     TEXT        NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_pos
  ON bot.playlist_tracks (playlist_id, position);

INSERT INTO public.schema_migrations (version)
SELECT '009_playlists'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '009_playlists');
