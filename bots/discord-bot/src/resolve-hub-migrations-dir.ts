import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the folder with `apps/discord-hub-api/migrations/*.sql`.
 * - Docker image: copy migrations to `/app/migrations` next to `dist/`.
 * - Dev (`tsx`): fall back to monorepo `apps/discord-hub-api/migrations`.
 * Override with `CLANKER_HUB_MIGRATIONS_DIR`.
 */
export function resolveHubMigrationsDir(): string {
  const override = process.env.CLANKER_HUB_MIGRATIONS_DIR?.trim();
  if (override) return override;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const sibling = path.join(here, '..', 'migrations');
  try {
    const hasSql = fs.readdirSync(sibling).some((f) => f.endsWith('.sql'));
    if (hasSql) return sibling;
  } catch {
    /* missing or unreadable */
  }
  return path.resolve(here, '../../../apps/discord-hub-api/migrations');
}
