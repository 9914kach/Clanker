-- Allow multiple League accounts per user.
-- Before: league_connections.user_id PRIMARY KEY (one account only)
-- After:  id BIGSERIAL PRIMARY KEY, UNIQUE (user_id, riot_id, tag_line)
--         + puuid column (filled on first sync)
--
-- Before: league_snapshots.user_id PRIMARY KEY
-- After:  PRIMARY KEY (user_id, puuid)
--
-- Before: stats.league_matches UNIQUE (user_id, match_id)
-- After:  UNIQUE (user_id, puuid, match_id) so two accounts can each log the same match

-- ── league_connections ────────────────────────────────────────────────────────

ALTER TABLE profile.league_connections
  DROP CONSTRAINT league_connections_pkey;

ALTER TABLE profile.league_connections
  ADD COLUMN id BIGSERIAL;

ALTER TABLE profile.league_connections
  ADD PRIMARY KEY (id);

ALTER TABLE profile.league_connections
  ADD CONSTRAINT league_connections_riot_unique
  UNIQUE (user_id, riot_id, tag_line);

ALTER TABLE profile.league_connections
  ADD COLUMN IF NOT EXISTS puuid TEXT NULL;

-- ── league_snapshots ──────────────────────────────────────────────────────────

ALTER TABLE profile.league_snapshots
  ADD COLUMN puuid TEXT;

-- Extract puuid from stored JSONB payload (account.puuid)
UPDATE profile.league_snapshots
  SET puuid = payload->'account'->>'puuid';

-- Fallback for any rows without a puuid in payload (shouldn't happen)
UPDATE profile.league_snapshots
  SET puuid = 'migrated_' || user_id
  WHERE puuid IS NULL;

ALTER TABLE profile.league_snapshots
  ALTER COLUMN puuid SET NOT NULL;

ALTER TABLE profile.league_snapshots
  DROP CONSTRAINT league_snapshots_pkey;

ALTER TABLE profile.league_snapshots
  ADD PRIMARY KEY (user_id, puuid);

-- Back-fill puuid onto connections that match a snapshot
UPDATE profile.league_connections lc
  SET puuid = ls.puuid
  FROM profile.league_snapshots ls
  WHERE lc.user_id = ls.user_id
    AND lc.puuid IS NULL;

-- ── stats.league_matches ──────────────────────────────────────────────────────

-- Drop old unique constraint and add puuid to it so two accounts can record
-- the same match independently.
ALTER TABLE stats.league_matches
  DROP CONSTRAINT IF EXISTS league_matches_user_id_match_id_key;

ALTER TABLE stats.league_matches
  ADD CONSTRAINT league_matches_user_puuid_match_unique
  UNIQUE (user_id, puuid, match_id);

-- ── Migration record ──────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
SELECT '011_multi_league'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '011_multi_league');
