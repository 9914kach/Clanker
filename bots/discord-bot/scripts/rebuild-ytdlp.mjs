/**
 * Re-run youtube-dl-exec postinstall (downloads yt-dlp.exe into node_modules).
 * Use when you see: spawn ... yt-dlp.exe ENOENT
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pkgRoot;
try {
  pkgRoot = path.dirname(require.resolve('youtube-dl-exec/package.json'));
} catch {
  console.error('[music] youtube-dl-exec not found. Run npm install from the monorepo root.');
  process.exit(1);
}
const postinstall = path.join(pkgRoot, 'scripts', 'postinstall.js');
const env = { ...process.env };
delete env.YOUTUBE_DL_SKIP_DOWNLOAD;
console.log('[music] Downloading yt-dlp into', path.join(pkgRoot, 'bin'));
const r = spawnSync(process.execPath, [postinstall], { stdio: 'inherit', cwd: pkgRoot, env });
process.exit(r.status === null ? 1 : r.status);
