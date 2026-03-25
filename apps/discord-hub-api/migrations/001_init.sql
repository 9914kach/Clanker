-- Minimal schema for profiles, League connection, and latest Riot sync snapshot
-- Idempotent-ish by guarding with IF NOT EXISTS where possible

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Discord user profile: identity and visibility
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  global_name TEXT NULL,
  avatar TEXT NULL,
  banner TEXT NULL,
  accent_color INTEGER NULL,
  visibility TEXT NOT NULL DEFAULT 'public', -- 'public' | 'private'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- League connection per user
CREATE TABLE IF NOT EXISTS league_connections (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  riot_id TEXT NOT NULL,
  tag_line TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('EUW','EUNE','NA','KR','BR')),
  auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
  rank_preference TEXT NOT NULL DEFAULT 'solo' CHECK (rank_preference IN ('solo','flex')),
  status_message TEXT NOT NULL DEFAULT '',
  linked_at TIMESTAMPTZ NOT NULL,
  last_sync_requested_at TIMESTAMPTZ NULL
);

-- Latest sync snapshot from Riot, stored as JSON for simplicity
CREATE TABLE IF NOT EXISTS league_snapshots (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);

-- Touch updated_at on profiles when rows change
CREATE OR REPLACE FUNCTION set_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_profiles_set_updated_at'
  ) THEN
    CREATE TRIGGER tr_profiles_set_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_profiles_updated_at();
  END IF;
END;
$$;

-- Record this migration
INSERT INTO schema_migrations (version)
SELECT '001_init'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_init');

