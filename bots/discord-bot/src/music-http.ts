import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { type Client } from 'discord.js';
import {
  enqueue, skip, pause, resume, stop, seek,
  addTrackToPlaylist, playPlaylist,
} from './music-player.js';

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

  const server = serve(
    { fetch: app.fetch, port, hostname: '127.0.0.1' },
    (info) => {
      console.log(`[music-http] Listening on 127.0.0.1:${info.port}`);
    },
  );

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[music-http] Port ${port} is already in use. Stop the other process (e.g. \`docker compose stop discord-bot\`) or set MUSIC_BOT_HTTP_PORT to a free port.`,
      );
    } else {
      console.error('[music-http] HTTP server error:', err.message);
    }
    process.exit(1);
  });
}
