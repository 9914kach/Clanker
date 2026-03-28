-- Reorganize tables into logical schemas: profile, hub, bot
-- Existing FK constraints survive schema moves (Postgres stores OIDs, not names)

CREATE SCHEMA IF NOT EXISTS profile;
CREATE SCHEMA IF NOT EXISTS hub;
CREATE SCHEMA IF NOT EXISTS bot;

-- profile schema: Discord identity + game integrations
ALTER TABLE public.profiles           SET SCHEMA profile;
ALTER TABLE public.league_connections SET SCHEMA profile;
ALTER TABLE public.league_snapshots   SET SCHEMA profile;

-- hub schema: dashboard features and tools
ALTER TABLE public.hub_user_settings  SET SCHEMA hub;
ALTER TABLE hub.hub_user_settings     RENAME TO user_settings;
ALTER TABLE public.wheel_groups       SET SCHEMA hub;
ALTER TABLE public.wheel_sessions     SET SCHEMA hub;

-- bot schema: data managed by the Discord bot process
ALTER TABLE public.guild_voice_states SET SCHEMA bot;

-- Move trigger functions to match their tables
ALTER FUNCTION public.set_profiles_updated_at()          SET SCHEMA profile;
ALTER FUNCTION public.set_wheel_groups_updated_at()      SET SCHEMA hub;
ALTER FUNCTION public.set_guild_voice_states_updated_at() SET SCHEMA bot;

INSERT INTO public.schema_migrations (version)
SELECT '005_schemas'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '005_schemas');
