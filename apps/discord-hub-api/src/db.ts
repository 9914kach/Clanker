import pg from "pg";
import type { AppEnv } from "./env.js";

let pool: pg.Pool | null = null;

export function initDb(env: AppEnv): pg.Pool | null {
  if (!env.databaseUrl) {
    return null;
  }
  pool = new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export function getPool(): pg.Pool | null {
  return pool;
}

/** Kastar om pool finns men anslutning/query misslyckas. */
export async function verifyDbConnection(): Promise<void> {
  if (!pool) {
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("select 1 as ok");
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
