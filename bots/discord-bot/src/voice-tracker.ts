import { type Client, Events, type VoiceState } from 'discord.js';
import { getPool } from './db.js';

type QueryRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

async function upsertVoiceState(db: QueryRunner, state: VoiceState): Promise<void> {
  const member = state.member;
  const username = member?.user.username ?? 'unknown';
  const globalName = member?.user.globalName ?? null;
  const avatar = member?.user.avatar ?? null;
  const channelName = state.channel?.name ?? null;

  await db.query(
    `INSERT INTO bot.guild_voice_states
       (guild_id, user_id, channel_id, channel_name, username, global_name, avatar,
        is_muted, is_deafened, is_streaming, is_video, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       channel_id   = EXCLUDED.channel_id,
       channel_name = EXCLUDED.channel_name,
       username     = EXCLUDED.username,
       global_name  = EXCLUDED.global_name,
       avatar       = EXCLUDED.avatar,
       is_muted     = EXCLUDED.is_muted,
       is_deafened  = EXCLUDED.is_deafened,
       is_streaming = EXCLUDED.is_streaming,
       is_video     = EXCLUDED.is_video`,
    [
      state.guild.id,
      state.id,
      state.channelId,
      channelName,
      username,
      globalName,
      avatar,
      (state.selfMute || state.serverMute) ?? false,
      (state.selfDeaf || state.serverDeaf) ?? false,
      state.streaming ?? false,
      state.selfVideo ?? false,
    ],
  );
}

export async function snapshotAllGuilds(client: Client<true>): Promise<void> {
  const pool = getPool();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('DELETE FROM bot.guild_voice_states');
    for (const guild of client.guilds.cache.values()) {
      for (const voiceState of guild.voiceStates.cache.values()) {
        if (!voiceState.channelId) continue;
        await upsertVoiceState(db as unknown as QueryRunner, voiceState);
      }
    }
    await db.query('COMMIT');
    console.log('[voice-tracker] snapshot complete');
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[voice-tracker] snapshot failed', err);
  } finally {
    db.release();
  }
}

export async function handleVoiceStateUpdate(
  _oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const pool = getPool();
  try {
    if (newState.channelId === null) {
      await pool.query(
        'DELETE FROM bot.guild_voice_states WHERE guild_id = $1 AND user_id = $2',
        [newState.guild.id, newState.id],
      );
    } else {
      await upsertVoiceState(pool as unknown as QueryRunner, newState);
    }
  } catch (err) {
    console.error('[voice-tracker] VoiceStateUpdate error', err);
  }
}

export function registerVoiceTracker(client: Client): void {
  client.once(Events.ClientReady, async (c) => {
    await snapshotAllGuilds(c);
  });

  client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);
}
