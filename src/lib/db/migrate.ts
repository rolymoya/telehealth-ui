// Applies all pending Drizzle migrations to the target database.
// Rollback: npm run db:rollback (src/lib/db/rollback.ts)
//
// Connection resolution order:
//   1. DATABASE_URL env var (local dev / CI masked secret)
//   2. DB_SECRET_ARN env var → Secrets Manager (App Runner / ECS runtime)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { getConnectionString, createPool } from "./connection";

async function main() {
  const { url, ssl } = await getConnectionString();
  const pool = createPool(url, ssl, 1);

  try {
    const db = drizzle(pool);
    const migrationsFolder = path.join(import.meta.dirname, "migrations");
    console.log("Running migrations from:", migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log("Migrations complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
