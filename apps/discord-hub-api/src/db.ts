import pg from "pg";
import type { AppEnv } from "./env.js";

let pool: pg.Pool | null = null;

export function initDb(env: AppEnv): pg.Pool | null {
  if (!env.dbConfig) {
    return null;
  }
  const cfg =
    env.dbConfig.kind === "url"
      ? { connectionString: env.dbConfig.url }
      : {
          host: env.dbConfig.host,
          port: env.dbConfig.port,
          user: env.dbConfig.user,
          password: env.dbConfig.password,
          database: env.dbConfig.database,
        };
  pool = new pg.Pool({ ...cfg, max: 10, connectionTimeoutMillis: 10_000 });
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
