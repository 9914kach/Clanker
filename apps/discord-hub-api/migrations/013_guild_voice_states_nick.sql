-- Server nickname for voice roster: matches Discord member list / auto-move name resolution.

ALTER TABLE bot.guild_voice_states
  ADD COLUMN IF NOT EXISTS nick TEXT NULL;

INSERT INTO public.schema_migrations (version)
SELECT '013_guild_voice_states_nick'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '013_guild_voice_states_nick');
