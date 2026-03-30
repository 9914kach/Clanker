/**
 * Must load before `@discordjs/voice` so prism-media sees `FFMPEG_PATH` on first use.
 * Also centralises yt-dlp path resolution (youtube-dl-exec postinstall often skipped / blocked).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);

export const FFMPEG_STATIC_BIN = nodeRequire('ffmpeg-static') as string | null;

function configureFfmpegPathForVoice(): void {
  const envRaw = process.env.FFMPEG_PATH?.trim();
  if (envRaw) {
    const normalized = path.normalize(envRaw);
    if (existsSync(normalized)) {
      process.env.FFMPEG_PATH = normalized;
      return;
    }
    console.warn(
      `[music] FFMPEG_PATH points to a missing file (${normalized}). Ignoring it and trying ffmpeg-static.`,
    );
  }

  if (FFMPEG_STATIC_BIN) {
    const normalized = path.normalize(FFMPEG_STATIC_BIN);
    if (existsSync(normalized)) {
      process.env.FFMPEG_PATH = normalized;
      return;
    }
    console.warn(
      `[music] ffmpeg-static path has no file (${normalized}). Often: antivirus, or npm install not from monorepo root. Try: winget install Gyan.FFmpeg and set FFMPEG_PATH to ffmpeg.exe.`,
    );
    process.env.FFMPEG_PATH = normalized;
    return;
  }

  console.warn(
    '[music] ffmpeg-static not found — run `npm install` from the monorepo root. Then restart the bot.',
  );
}

configureFfmpegPathForVoice();

let cachedYtdlp: string | undefined;

function bundledYtdlpPath(): string {
  const { YOUTUBE_DL_PATH } = nodeRequire('youtube-dl-exec').constants as {
    YOUTUBE_DL_PATH: string;
  };
  return path.normalize(YOUTUBE_DL_PATH);
}

/** Path to yt-dlp for `spawn` (YouTube / Spotify→YouTube). */
export function resolveYtDlpSpawnPath(): string {
  if (cachedYtdlp !== undefined) {
    return cachedYtdlp;
  }

  const envPath = process.env.YTDLP_PATH?.trim();
  if (envPath) {
    const n = path.normalize(envPath);
    if (existsSync(n)) {
      cachedYtdlp = n;
      return n;
    }
    console.warn(`[music] YTDLP_PATH is set but file missing: ${n}`);
  }

  const bundled = bundledYtdlpPath();
  if (existsSync(bundled)) {
    cachedYtdlp = bundled;
    return bundled;
  }

  console.error(
    `[music] yt-dlp missing at ${bundled}. Fixes: (1) Repo root: npm run rebuild:ytdlp -w discord-bot  (2) Or: winget install yt-dlp  then set YTDLP_PATH to yt-dlp.exe  (3) npm must not use --ignore-scripts (postinstall downloads the binary).`,
  );
  cachedYtdlp = bundled;
  return bundled;
}

void resolveYtDlpSpawnPath();
