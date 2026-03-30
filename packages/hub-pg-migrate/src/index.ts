import fs from "node:fs";
import path from "node:path";
import type pg from "pg";

export type MigrationLogger = (line: string) => void;

/**
 * Applies `.sql` files in `migrationsDir` (sorted by filename) that are not yet recorded in `public.schema_migrations`.
 * Safe to call on every process start; already-applied versions are skipped.
 */
export async function runSqlMigrations(
  pool: pg.Pool,
  migrationsDir: string,
  log: MigrationLogger = (s) => console.log(s),
): Promise<void> {
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  } catch (e) {
    throw new Error(`Cannot read migrations directory ${migrationsDir}: ${(e as Error).message}`);
  }

  const client = await pool.connect();
  try {
    await client.query("SELECT 1 AS ok");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const appliedRes = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations",
    );
    const applied = new Set(appliedRes.rows.map((r) => r.version));

    for (const f of files) {
      const version = f.replace(/\.sql$/, "");
      if (applied.has(version)) {
        log(`Skipped ${f} (already applied)`);
        continue;
      }
      await client.query("BEGIN");
      try {
        const filePath = path.join(migrationsDir, f);
        const sql = fs.readFileSync(filePath, "utf8");
        await client.query(sql);
        await client.query("COMMIT");
        log(`Applied ${f}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    client.release();
  }
}
