-- Riot match-v5 `info.gameMode`, `info.gameType`, `info.mapId` for stats / UI.

ALTER TABLE stats.league_matches
  ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS map_id INT NOT NULL DEFAULT 0;

INSERT INTO public.schema_migrations (version)
SELECT '012_league_match_modes'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '012_league_match_modes');
