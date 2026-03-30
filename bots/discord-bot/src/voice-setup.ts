import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ESM `import 'libsodium-wrappers'` resolves to modules-esm/*.mjs, which imports a
// sibling ./libsodium.mjs that npm does not place there (broken layout). CJS main bundles correctly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sodium = require('libsodium-wrappers') as { ready: Promise<void> };

/**
 * @discordjs/voice loads encryption in a fire-and-forget async IIFE; awaiting sodium here
 * avoids racing the first joinVoiceChannel before libsodium-wrappers is ready.
 * Discord voice (DAVE / e2ee) uses `@snazzah/davey` — keep it installed (see package.json).
 */
export async function prepareDiscordVoiceCrypto(): Promise<void> {
  await sodium.ready;
}
