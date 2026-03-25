import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadDotenv({ path: path.join(repoRoot, ".env") });
loadDotenv({
  path: path.join(repoRoot, "apps/discord-hub-api/.env"),
  override: true,
});

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set; cannot run migrations");
  }
  const head = databaseUrl.slice(0, 14).toLowerCase();
  if (!head.startsWith("postgres://") && !head.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://");
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

  const migrationsDir = path.join(repoRoot, "apps/discord-hub-api/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("select 1 as ok");
    await client.query("BEGIN");
    for (const f of files) {
      const filePath = path.join(migrationsDir, f);
      const sql = fs.readFileSync(filePath, "utf8");
      await client.query(sql);
      process.stdout.write(`Applied ${f}\n`);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
