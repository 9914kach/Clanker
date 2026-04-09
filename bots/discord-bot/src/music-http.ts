import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { type Client } from 'discord.js';
import { getPool } from './db.js';
import {
  enqueue, skip, previous, pause, resume, stop, seek, shuffleQueue,
  reorderMusicQueue,
  addTrackToPlaylist, playPlaylist,
} from './music-player.js';

const GUILD_SNOWFLAKE_RE = /^\d{5,32}$/;

type PlayBody = { guildId: string; channelId: string; userId: string; query: string };

function isSpotifyPlaylistQuery(query: string): boolean {
  return /spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\//i.test(query);
}
type GuildBody = { guildId: string };
type PlaylistAddBody = { guildId: string; playlistName: string; query: string; userId: string };
type PlaylistPlayBody = { guildId: string; channelId: string; userId: string; playlistName: string };

export function startMusicHttpServer(client: Client, port: number): void {
  const app = new Hono();

  app.post('/play', async (c) => {
    const body = await c.req.json<PlayBody>();
    const { guildId, channelId, userId, query } = body;
    if (!guildId || !channelId || !userId || !query) {
      return c.json({ error: 'Missing fields' }, 400);
    }
    const result = await enqueue(client, guildId, query, userId, channelId);
    if (!result) {
      if (isSpotifyPlaylistQuery(query)) {
        return c.json(
          {
            error: 'Spotify playlist unavailable',
            code: 'spotify_playlist',
          },
          422,
        );
      }
      return c.json({ error: 'Could not resolve track' }, 422);
    }
    /* `track` kept for older clients; `result` has full EnqueueResult (playlist vs single). */
    return c.json({
      ok: true,
      result,
      track: result.kind === 'track' ? result.track : result.first,
      ...(result.kind === 'playlist'
        ? { playlistTitle: result.title, queued: result.queued }
        : {}),
    });
  });

  app.post('/playlist/add-track', async (c) => {
    const body = await c.req.json<PlaylistAddBody>();
    const { guildId, playlistName, query, userId } = body;
    if (!guildId || !playlistName || !query || !userId) {
      return c.json({ error: 'Missing fields' }, 400);
    }
    const result = await addTrackToPlaylist(guildId, playlistName, query, userId);
    if (!result) return c.json({ error: 'Playlist not found or track could not be resolved' }, 422);
    return c.json({ ok: true, track: result.track, position: result.position });
  });

  app.post('/playlist/play', async (c) => {
    const body = await c.req.json<PlaylistPlayBody>();
    const { guildId, channelId, userId, playlistName } = body;
    if (!guildId || !channelId || !userId || !playlistName) {
      return c.json({ error: 'Missing fields' }, 400);
    }
    const result = await playPlaylist(client, guildId, playlistName, userId, channelId);
    if (!result) return c.json({ error: 'Playlist not found' }, 404);
    return c.json({ ok: true, name: result.name, queued: result.queued });
  });

  app.post('/skip', async (c) => {
    const { guildId } = await c.req.json<GuildBody>();
    await skip(guildId);
    return c.json({ ok: true });
  });

  app.post('/previous', async (c) => {
    const { guildId } = await c.req.json<GuildBody>();
    const wentBack = await previous(guildId);
    return c.json({ ok: true, wentBack });
  });

  app.post('/shuffle', async (c) => {
    const { guildId } = await c.req.json<GuildBody>();
    const shuffled = await shuffleQueue(guildId);
    return c.json({ ok: true, shuffled });
  });

  app.post('/pause', async (c) => {
    const { guildId } = await c.req.json<GuildBody>();
    await pause(guildId);
    return c.json({ ok: true });
  });

  app.post('/resume', async (c) => {
    const { guildId } = await c.req.json<GuildBody>();
    await resume(guildId);
    return c.json({ ok: true });
  });

  app.post('/stop', async (c) => {
    const { guildId } = await c.req.json<GuildBody>();
    await stop(guildId);
    return c.json({ ok: true });
  });

  app.post('/seek', async (c) => {
    const { guildId, seekSec } = await c.req.json<{ guildId: string; seekSec: number }>();
    await seek(guildId, seekSec);
    return c.json({ ok: true });
  });

  /** Hub-api proxies here so multiple hubs can show the same queue without sharing their own Postgres. */
  app.get('/music/state', async (c) => {
    const guildId = c.req.query('guildId')?.trim() ?? '';
    if (!GUILD_SNOWFLAKE_RE.test(guildId)) {
      return c.json({ error: 'Invalid guild id' }, 400);
    }
    const pool = getPool();
    const [nowRes, queueRes] = await Promise.all([
      pool.query(
        `SELECT guild_id, track_url, title, artist, thumbnail, duration_sec, source,
                requested_by, channel_id, is_paused, started_at, updated_at
         FROM bot.music_now_playing WHERE guild_id = $1`,
        [guildId],
      ),
      pool.query(
        `SELECT id, track_url, title, artist, thumbnail, duration_sec, source,
                requested_by, added_at
         FROM bot.music_queue WHERE guild_id = $1 ORDER BY added_at`,
        [guildId],
      ),
    ]);
    return c.json({
      now_playing: nowRes.rows[0] ?? null,
      queue: queueRes.rows,
      total_in_queue: queueRes.rowCount ?? 0,
    });
  });

  app.post('/music/queue/reorder', async (c) => {
    const body = await c.req.json<{ guildId: string; orderedIds: unknown }>();
    const { guildId, orderedIds } = body;
    if (!guildId || !GUILD_SNOWFLAKE_RE.test(guildId)) {
      return c.json({ error: 'Invalid guild id' }, 400);
    }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return c.json({ error: 'orderedIds must be a non-empty array' }, 400);
    }
    const ids = orderedIds.map((x) => (typeof x === 'number' ? x : Number(x)));
    if (!ids.every((n) => Number.isInteger(n) && n > 0)) {
      return c.json({ error: 'orderedIds must be positive integers' }, 400);
    }
    try {
      const ok = await reorderMusicQueue(guildId, ids);
      if (!ok) return c.json({ error: 'Queue mismatch — refresh and try again' }, 409);
      return c.json({ ok: true });
    } catch (err) {
      console.error('[music-http] queue reorder:', (err as Error).message);
      return c.json({ error: 'Reorder failed' }, 500);
    }
  });

  app.delete('/music/queue/:itemId', async (c) => {
    const guildId = c.req.query('guildId')?.trim() ?? '';
    if (!GUILD_SNOWFLAKE_RE.test(guildId)) {
      return c.json({ error: 'Invalid guild id' }, 400);
    }
    const itemId = Number(c.req.param('itemId'));
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return c.json({ error: 'Invalid item id' }, 400);
    }
    const result = await getPool().query(
      `DELETE FROM bot.music_queue WHERE id = $1 AND guild_id = $2`,
      [itemId, guildId],
    );
    if ((result.rowCount ?? 0) === 0) {
      return c.json({ error: 'Item not found' }, 404);
    }
    return c.json({ ok: true });
  });

  const bind =
    process.env.MUSIC_BOT_HTTP_BIND?.trim() === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';

  const server = serve(
    { fetch: app.fetch, port, hostname: bind },
    (info) => {
      console.log(`[music-http] Listening on ${bind}:${info.port}`);
    },
  );

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[music-http] Port ${port} is already in use. Stop the other process (e.g. \`docker compose stop discord-bot\`) or set MUSIC_BOT_HTTP_PORT to a free port.`,
      );
      console.warn('[music-http] Continuing without local music HTTP server in this process.');
      return;
    } else {
      console.error('[music-http] HTTP server error:', err.message);
    }
    // Immediate process.exit(1) on Windows can trip libuv (UV_HANDLE_CLOSING) while the HTTP handle is still unwinding.
    setImmediate(() => process.exit(1));
  });
}
