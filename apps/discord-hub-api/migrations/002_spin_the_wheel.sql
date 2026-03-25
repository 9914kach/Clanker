-- Spin the Wheel: saved participant groups + recent sessions
-- Idempotent-ish by guarding with IF NOT EXISTS where possible

CREATE TABLE IF NOT EXISTS wheel_groups (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  participants JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_groups_owner_updated_at
  ON wheel_groups (owner_user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION set_wheel_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_wheel_groups_set_updated_at'
  ) THEN
    CREATE TRIGGER tr_wheel_groups_set_updated_at
    BEFORE UPDATE ON wheel_groups
    FOR EACH ROW
    EXECUTE FUNCTION set_wheel_groups_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS wheel_sessions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  group_id TEXT NULL REFERENCES wheel_groups(id) ON DELETE SET NULL,
  seed TEXT NULL,
  team_count INTEGER NOT NULL,
  team_mode TEXT NOT NULL CHECK (team_mode IN ('balanced','equal')),
  participants JSONB NOT NULL,
  winner TEXT NULL,
  teams JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_sessions_owner_created_at
  ON wheel_sessions (owner_user_id, created_at DESC);

INSERT INTO schema_migrations (version)
SELECT '002_spin_the_wheel'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002_spin_the_wheel');

