// Reverts the last applied Drizzle migration by dropping the apoth schema
// and re-running all migrations up to (but not including) the last SQL file.
//
// Limitations:
//   - Only works in local dev and staging. Never run in production.
//   - Drizzle has no native down-migration support. This script resets the
//     schema from scratch, which is safe when the schema has no user data.
//
// Connection resolution: same as migrate.ts (DATABASE_URL → DB_SECRET_ARN).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { readdir, copyFile, mkdir, rm } from "fs/promises";
import path from "path";
import os from "os";

interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

async function getConnectionString(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const arn = process.env.DB_SECRET_ARN;
  if (!arn) {
    throw new Error("Either DATABASE_URL or DB_SECRET_ARN must be set");
  }
  const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const s: DbSecret = JSON.parse(res.SecretString ?? "{}");
  return `postgresql://${s.username}:${s.password}@${s.host}:${s.port}/${s.dbname}`;
}

async function main() {
  const migrationsFolder = path.join(import.meta.dirname, "migrations");
  const allFiles = (await readdir(migrationsFolder))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (allFiles.length <= 1) {
    console.log("Nothing to roll back — only the baseline migration exists.");
    process.exit(0);
  }

  const filesToKeep = allFiles.slice(0, -1);
  const dropped = allFiles[allFiles.length - 1];
  console.log(`Rolling back: ${dropped}`);

  // Copy all-but-last migrations into a temp folder, then replay from scratch.
  const tmpDir = await mkdir(path.join(os.tmpdir(), `apoth-rollback-${Date.now()}`), { recursive: true }).then(
    () => path.join(os.tmpdir(), `apoth-rollback-${Date.now() - 1}`)
  );
  await mkdir(tmpDir, { recursive: true });
  for (const f of filesToKeep) {
    await copyFile(path.join(migrationsFolder, f), path.join(tmpDir, f));
  }

  const connectionString = await getConnectionString();
  const pool = new Pool({ connectionString, max: 1 });

  console.log("Dropping apoth schema...");
  await pool.query("DROP SCHEMA IF EXISTS apoth CASCADE");
  await pool.query("DELETE FROM drizzle.__drizzle_migrations WHERE 1=1").catch(() => {});

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: tmpDir });

  await rm(tmpDir, { recursive: true, force: true });
  console.log("Rollback complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Rollback failed:", err);
  process.exit(1);
});
