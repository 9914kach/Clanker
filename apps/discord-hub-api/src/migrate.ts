import { runSqlMigrations } from "@clanker/hub-pg-migrate";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadDotenv({ path: path.join(repoRoot, ".env") });
loadDotenv({
  path: path.join(repoRoot, "apps/discord-hub-api/.env"),
  override: true,
});

function buildPgPoolConfig(): pg.PoolConfig {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const head = url.slice(0, 14).toLowerCase();
    if (!head.startsWith("postgres://") && !head.startsWith("postgresql://")) {
      throw new Error("DATABASE_URL must start with postgres:// or postgresql://");
    }
    return { connectionString: url, max: 2, connectionTimeoutMillis: 10_000 };
  }
  const user = process.env.POSTGRES_USER?.trim();
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const database = process.env.POSTGRES_DB?.trim();
  if (!user || !password || !database) {
    throw new Error("Neither DATABASE_URL nor POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB are set; cannot run migrations");
  }
  return {
    host: process.env.POSTGRES_HOST?.trim() || "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT?.trim() || "5432"),
    user,
    password,
    database,
    max: 2,
    connectionTimeoutMillis: 10_000,
  };
}

async function run(): Promise<void> {
  const pool = new pg.Pool(buildPgPoolConfig());
  const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  try {
    await runSqlMigrations(pool, migrationsDir, (line) => process.stdout.write(`${line}\n`));
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
