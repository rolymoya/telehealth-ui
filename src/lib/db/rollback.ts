// Reverts the last applied Drizzle migration by dropping the apoth schema
// and re-running all migrations up to (but not including) the last SQL file.
//
// Limitations:
//   - Only works in local dev and staging. Hard-blocked in production.
//   - Drizzle has no native down-migration support. This script resets the
//     schema from scratch, which is safe only when the schema has no user data.
//
// Connection resolution: same as migrate.ts (DATABASE_URL → DB_SECRET_ARN).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readdir, copyFile, mkdir, rm } from "fs/promises";
import path from "path";
import os from "os";
import { getConnectionString, createPool } from "./connection";

function assertNotProduction() {
  if (process.env.NODE_ENV === "production" && !process.env.APOTH_ALLOW_DESTRUCTIVE) {
    console.error(
      "FATAL: db:rollback refused — NODE_ENV is 'production'. " +
        "Set APOTH_ALLOW_DESTRUCTIVE=1 to override (requires explicit intent).",
    );
    process.exit(1);
  }
}

async function main() {
  assertNotProduction();

  const migrationsFolder = path.join(import.meta.dirname, "migrations");
  const allFiles = (await readdir(migrationsFolder)).filter((f) => f.endsWith(".sql")).sort();

  if (allFiles.length <= 1) {
    console.log("Nothing to roll back — only the baseline migration exists.");
    process.exit(0);
  }

  const filesToKeep = allFiles.slice(0, -1);
  const dropped = allFiles[allFiles.length - 1];
  console.log(`Rolling back: ${dropped}`);

  // Capture timestamp once so mkdir and copyFile use the same path.
  const tmpDir = path.join(os.tmpdir(), `apoth-rollback-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  for (const f of filesToKeep) {
    await copyFile(path.join(migrationsFolder, f), path.join(tmpDir, f));
  }

  const { url, ssl } = await getConnectionString();
  const pool = createPool(url, ssl, 1);

  try {
    console.log("Dropping apoth schema...");
    await pool.query("DROP SCHEMA IF EXISTS apoth CASCADE");

    // Only suppress table-not-found (42P01); log anything unexpected.
    await pool.query("DELETE FROM drizzle.__drizzle_migrations WHERE 1=1").catch((err: { code?: string }) => {
      if (err?.code !== "42P01") {
        console.warn("[rollback] unexpected error clearing migrations table:", err);
      }
    });

    const db = drizzle(pool);
    try {
      await migrate(db, { migrationsFolder: tmpDir });
    } catch (migrateErr) {
      // Schema is gone; operator must restore from backup.
      console.error(
        "FATAL: apoth schema was dropped but migration replay failed. Manual restore from backup required.",
        migrateErr,
      );
      process.exit(2);
    }

    console.log("Rollback complete.");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Rollback failed:", err);
  process.exit(1);
});
