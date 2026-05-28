// Applies all pending Drizzle migrations to the target database.
// Rollback: npm run db:rollback (src/lib/db/rollback.ts)
//
// Connection resolution order:
//   1. DATABASE_URL env var (local dev / CI masked secret)
//   2. DB_SECRET_ARN env var → Secrets Manager (App Runner / ECS runtime)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import path from "path";

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
  const connectionString = await getConnectionString();
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  const migrationsFolder = path.join(import.meta.dirname, "migrations");
  console.log("Running migrations from:", migrationsFolder);

  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
