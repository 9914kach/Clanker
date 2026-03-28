import {
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  generateDependencyReport,
  getVoiceConnection,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import { existsSync } from 'node:fs';
import { type Client } from 'discord.js';
import playdl from 'play-dl';
import { getPool } from './db.js';

function logVoiceReadyFailureHints(): void {
  const inDocker = existsSync('/.dockerenv');
  if (inDocker) {
    console.error(
      '[music] Voice never reached Ready (timeout/aborted). In Docker this is usually bridge NAT blocking UDP to Discord.',
    );
    console.error(
      '[music] Fix: Linux/Pi → `discord-bot-host` (compose profile `discord-host`). Docker Desktop → run on host: `npm run bot:dev`.',
    );
  } else {
    console.error(
      '[music] Voice never reached Ready (timeout/aborted). Signalling/UDP to Discord failed (not Opus/FFmpeg if the report below looks OK).',
    );
    console.error(
      '[music] On Windows: allow Node.js in Windows Defender Firewall (private networks); try with VPN off; ensure the bot role can Connect and Speak in that voice channel.',
    );
    console.error(
      '[music] If it still fails, try another network (e.g. phone hotspot) to rule out ISP/router blocking UDP.',
    );
  }
  console.error(generateDependencyReport());
}

export type TrackSource = 'youtube' | 'soundcloud' | 'spotify';

export type Track = {
  url: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  durationSec: number | null;
  source: TrackSource;
  requestedBy: string;
  channelId: string;
};

type GuildPlayer = {
  player: AudioPlayer;
  connection: VoiceConnection;
  currentTrack: Track | null;
};

const players = new Map<string, GuildPlayer>();

/** Discord snowflakes must be strings for @discordjs/voice; numeric IDs can leave the connection stuck in signalling (see discord.js voice docs / common pitfalls). */
function voiceSnowflake(id: string | number | bigint): string {
  return String(id).trim();
}

let spotifyToken: { access_token: string; expires_at: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (spotifyToken && Date.now() < spotifyToken.expires_at - 30_000) {
    return spotifyToken.access_token;
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  spotifyToken = { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
  return spotifyToken.access_token;
}

async function resolveSpotifyTrack(url: string): Promise<{ title: string; artist: string } | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const match = url.match(/spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (!match) return null;

  const res = await fetch(`https://api.spotify.com/v1/tracks/${match[1]}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    name: string;
    artists: { name: string }[];
  };
  return { title: data.name, artist: data.artists[0]?.name ?? '' };
}

export async function initPlayDl(): Promise<void> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (clientId && clientSecret) {
    try {
      await getSpotifyToken();
      console.log('[music] Spotify credentials loaded.');
    } catch (err) {
      console.warn('[music] Spotify credentials failed:', (err as Error).message);
    }
  } else {
    console.warn('[music] No Spotify credentials — Spotify URLs will not work.');
  }
}

async function resolveTrack(query: string, requestedBy: string, channelId: string): Promise<Track | null> {
  try {
    // Spotify URL — resolve via Spotify API then search YouTube
    if (query.includes('spotify.com/track/')) {
      const sp = await resolveSpotifyTrack(query);
      if (!sp) return null;
      const searchQuery = `${sp.title} ${sp.artist}`.trim();
      const results = await playdl.search(searchQuery, { source: { youtube: 'video' }, limit: 1 });
      if (!results.length) return null;
      const yt = results[0];
      return {
        url: yt.url,
        title: sp.title,
        artist: sp.artist || null,
        thumbnail: yt.thumbnails?.[0]?.url ?? null,
        durationSec: yt.durationInSec ?? null,
        source: 'spotify',
        requestedBy,
        channelId,
      };
    }

    // YouTube URL or search
    const ytValidate = await playdl.yt_validate(query);
    if (ytValidate === 'video') {
      const info = await playdl.video_info(query);
      const d = info.video_details;
      return {
        url: d.url,
        title: d.title ?? 'Unknown',
        artist: d.channel?.name ?? null,
        thumbnail: d.thumbnails?.[0]?.url ?? null,
        durationSec: d.durationInSec ?? null,
        source: 'youtube',
        requestedBy,
        channelId,
      };
    }

    // SoundCloud URL
    const scValidate = await playdl.so_validate(query);
    if (scValidate === 'track') {
      const info = await playdl.soundcloud(query);
      if (info.type !== 'track') return null;
      const scTrack = info as typeof info & { thumbnail?: string };
      return {
        url: info.url,
        title: info.name,
        artist: info.user.name,
        thumbnail: scTrack.thumbnail ?? null,
        durationSec: Math.round(info.durationInMs / 1000),
        source: 'soundcloud',
        requestedBy,
        channelId,
      };
    }

    // Free-text search → YouTube
    const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (!results.length) return null;
    const yt = results[0];
    return {
      url: yt.url,
      title: yt.title ?? 'Unknown',
      artist: yt.channel?.name ?? null,
      thumbnail: yt.thumbnails?.[0]?.url ?? null,
      durationSec: yt.durationInSec ?? null,
      source: 'youtube',
      requestedBy,
      channelId,
    };
  } catch (err) {
    console.error('[music] resolveTrack error', err);
    return null;
  }
}

async function saveNowPlaying(guildId: string, track: Track): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO bot.music_now_playing
       (guild_id, track_url, title, artist, thumbnail, duration_sec, source,
        requested_by, channel_id, is_paused, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,now())
     ON CONFLICT (guild_id) DO UPDATE SET
       track_url    = EXCLUDED.track_url,
       title        = EXCLUDED.title,
       artist       = EXCLUDED.artist,
       thumbnail    = EXCLUDED.thumbnail,
       duration_sec = EXCLUDED.duration_sec,
       source       = EXCLUDED.source,
       requested_by = EXCLUDED.requested_by,
       channel_id   = EXCLUDED.channel_id,
       is_paused    = false,
       started_at   = now()`,
    [guildId, track.url, track.title, track.artist, track.thumbnail,
     track.durationSec, track.source, track.requestedBy, track.channelId],
  );
}

async function clearNowPlaying(guildId: string): Promise<void> {
  await getPool().query('DELETE FROM bot.music_now_playing WHERE guild_id = $1', [guildId]);
}

async function popNextFromQueue(guildId: string): Promise<Track | null> {
  const pool = getPool();
  const res = await pool.query<{
    id: number; track_url: string; title: string; artist: string | null;
    thumbnail: string | null; duration_sec: number | null; source: TrackSource;
    requested_by: string; channel_id?: string;
  }>(
    `DELETE FROM bot.music_queue
     WHERE id = (
       SELECT id FROM bot.music_queue WHERE guild_id = $1 ORDER BY added_at LIMIT 1
     )
     RETURNING *`,
    [guildId],
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    url: r.track_url,
    title: r.title,
    artist: r.artist,
    thumbnail: r.thumbnail,
    durationSec: r.duration_sec,
    source: r.source,
    requestedBy: r.requested_by,
    channelId: r.channel_id ?? '',
  };
}

async function addToQueue(guildId: string, track: Track): Promise<void> {
  await getPool().query(
    `INSERT INTO bot.music_queue
       (guild_id, track_url, title, artist, thumbnail, duration_sec, source, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [guildId, track.url, track.title, track.artist, track.thumbnail,
     track.durationSec, track.source, track.requestedBy],
  );
}

async function clearQueue(guildId: string): Promise<void> {
  await getPool().query('DELETE FROM bot.music_queue WHERE guild_id = $1', [guildId]);
}

async function playTrack(client: Client, guildId: string, track: Track): Promise<void> {
  const gid = voiceSnowflake(guildId);
  const tr: Track = { ...track, channelId: voiceSnowflake(track.channelId) };
  let gp = players.get(gid);

  // Ensure we have a voice connection
  if (!gp || gp.connection.state.status === VoiceConnectionStatus.Destroyed) {
    const guild = client.guilds.cache.get(gid);
    if (!guild) throw new Error(`Guild ${gid} not in cache`);
    const channel = guild.channels.cache.get(tr.channelId);
    if (!channel?.isVoiceBased()) throw new Error(`Channel ${tr.channelId} not a voice channel`);

    // Destroy any stale connection @discordjs/voice may still have registered.
    const stale = getVoiceConnection(gid);
    if (stale) {
      console.log(`[music] Destroying stale voice connection (${stale.state.status})`);
      stale.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: tr.channelId,
      guildId: gid,
      selfDeaf: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adapterCreator: guild.voiceAdapterCreator as any,
    });

    console.log(`[music] Voice connection created, initial state: ${connection.state.status}`);

    connection.on('error', (err) => {
      console.error(`[music] Voice connection error in ${gid}:`, err.message);
    });

    connection.on('stateChange', (oldState, newState) => {
      console.log(`[music] Voice state: ${oldState.status} → ${newState.status}`);
    });

    connection.on('debug', (msg) => {
      console.log(`[music] Voice debug: ${msg}`);
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      connection.destroy();
      const msg = (err as Error).message;
      if (msg.includes('aborted')) {
        logVoiceReadyFailureHints();
      }
      throw new Error(`Could not connect to voice channel: ${msg}`);
    }

    const player = createAudioPlayer();
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, async () => {
      const next = await popNextFromQueue(gid);
      if (next) {
        const guildPlayer = players.get(gid);
        if (guildPlayer) guildPlayer.currentTrack = next;
        await saveNowPlaying(gid, next);
        await startStream(player, next);
      } else {
        await clearNowPlaying(gid);
        connection.destroy();
        players.delete(gid);
      }
    });

    player.on('error', (err) => {
      console.error(`[music] Player error in ${gid}:`, err);
    });

    gp = { player, connection, currentTrack: tr };
    players.set(gid, gp);
  } else {
    gp.currentTrack = tr;
  }

  await saveNowPlaying(gid, tr);
  await startStream(gp.player, tr);
}

async function startStream(player: AudioPlayer, track: Track): Promise<void> {
  const stream = await playdl.stream(track.url, { quality: 2 });
  const resource = createAudioResource(stream.stream, { inputType: stream.type });
  player.play(resource);
}

// --- Public API ---

export async function enqueue(
  client: Client,
  guildId: string,
  query: string,
  requestedBy: string,
  channelId: string,
): Promise<Track | null> {
  const gid = voiceSnowflake(guildId);
  const cid = voiceSnowflake(channelId);
  const track = await resolveTrack(query, requestedBy, cid);
  if (!track) return null;

  const gp = players.get(gid);
  const isPlaying = gp &&
    gp.player.state.status !== AudioPlayerStatus.Idle &&
    gp.connection.state.status !== VoiceConnectionStatus.Destroyed;

  if (isPlaying) {
    await addToQueue(gid, track);
  } else {
    await playTrack(client, gid, track);
  }
  return track;
}

export async function skip(guildId: string): Promise<void> {
  const gid = voiceSnowflake(guildId);
  const gp = players.get(gid);
  if (!gp) return;
  gp.player.stop(); // triggers Idle → plays next from queue
}

export async function pause(guildId: string): Promise<void> {
  const gid = voiceSnowflake(guildId);
  const gp = players.get(gid);
  if (!gp) return;
  gp.player.pause();
  await getPool().query(
    'UPDATE bot.music_now_playing SET is_paused = true WHERE guild_id = $1',
    [gid],
  );
}

export async function resume(guildId: string): Promise<void> {
  const gid = voiceSnowflake(guildId);
  const gp = players.get(gid);
  if (!gp) return;
  gp.player.unpause();
  await getPool().query(
    'UPDATE bot.music_now_playing SET is_paused = false WHERE guild_id = $1',
    [gid],
  );
}

export async function stop(guildId: string): Promise<void> {
  const gid = voiceSnowflake(guildId);
  const gp = players.get(gid);
  if (gp) {
    gp.player.stop(true);
    gp.connection.destroy();
    players.delete(gid);
  }
  await clearQueue(gid);
  await clearNowPlaying(gid);
}

export function getLastChannelId(guildId: string): string | null {
  return players.get(voiceSnowflake(guildId))?.currentTrack?.channelId ?? null;
}
