/**
 * prism-media (via @discordjs/voice) resolves FFmpeg before checking process.env.FFMPEG_PATH.
 * This idempotently prepends an FFMPEG_PATH branch to src/core/FFmpeg.js so media-env.ts works.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botRoot = path.resolve(__dirname, '..');
/** Workspaces often hoist deps to monorepo root only — try bot package then repo root. */
const repoRoot = path.resolve(botRoot, '..', '..');

const MARKER = '/* clanker: FFMPEG_PATH */';

function resolveFfmpegJs() {
  for (const base of [botRoot, repoRoot]) {
    try {
      const voicePkgDir = path.dirname(require.resolve('@discordjs/voice', { paths: [base] }));
      const fromVoice = createRequire(path.join(voicePkgDir, 'package.json'));
      return fromVoice.resolve('prism-media/src/core/FFmpeg.js');
    } catch {
      /* try next base */
    }
  }
  return null;
}

const file = resolveFfmpegJs();
if (!file || !fs.existsSync(file)) {
  console.warn('[patch-prism] prism-media FFmpeg.js not found; skip (install deps from monorepo root).');
  process.exit(0);
}

let s = fs.readFileSync(file, 'utf8');
if (s.includes(MARKER)) {
  process.exit(0);
}

const oldRe =
  /const sources = \[(\(\) => \{\r?\n)(\s*)const ffmpegStatic = require\('ffmpeg-static'\);\r?\n\2return ffmpegStatic\.path \|\| ffmpegStatic;\r?\n(\s*)\}, 'ffmpeg', 'avconv', '\.\/ffmpeg', '\.\/avconv'\];/;

if (!oldRe.test(s)) {
  console.warn(
    '[patch-prism] FFmpeg.js layout changed (prism-media update?). Not patched — install ffmpeg in PATH or open an issue.',
  );
  process.exit(0);
}

s = s.replace(oldRe, (_, open, indent, closingBraceLine) => {
  return `const sources = [${open}${indent}${MARKER}
${indent}const fromEnv = typeof process.env.FFMPEG_PATH === 'string' ? process.env.FFMPEG_PATH.trim() : '';
${indent}if (fromEnv) return fromEnv;
${indent}const ffmpegStatic = require('ffmpeg-static');
${indent}return ffmpegStatic.path || ffmpegStatic;
${closingBraceLine}}, 'ffmpeg', 'avconv', './ffmpeg', './avconv'];`;
});

fs.writeFileSync(file, s, 'utf8');
console.log('[patch-prism] prism-media FFmpeg.js: FFMPEG_PATH check prepended.');
