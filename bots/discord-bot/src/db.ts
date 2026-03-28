import pg from 'pg';

let pool: pg.Pool | null = null;

export function initDb(databaseUrl: string): pg.Pool {
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('DB pool not initialised — call initDb() before using getPool()');
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
