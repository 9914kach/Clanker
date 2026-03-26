-- Per-user hub shell settings (prefs + dashboard layout), private JSON document

CREATE TABLE IF NOT EXISTS hub_user_settings (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_user_settings_updated_at ON hub_user_settings (updated_at);

INSERT INTO schema_migrations (version)
SELECT '003_hub_user_settings'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003_hub_user_settings');
