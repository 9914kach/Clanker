import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { type Client } from 'discord.js';
import { enqueue, skip, pause, resume, stop } from './music-player.js';

type PlayBody = { guildId: string; channelId: string; userId: string; query: string };
type GuildBody = { guildId: string };

export function startMusicHttpServer(client: Client, port: number): void {
  const app = new Hono();

  app.post('/play', async (c) => {
    const body = await c.req.json<PlayBody>();
    const { guildId, channelId, userId, query } = body;
    if (!guildId || !channelId || !userId || !query) {
      return c.json({ error: 'Missing fields' }, 400);
    }
    const track = await enqueue(client, guildId, query, userId, channelId);
    if (!track) return c.json({ error: 'Could not resolve track' }, 422);
    return c.json({ ok: true, track });
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
