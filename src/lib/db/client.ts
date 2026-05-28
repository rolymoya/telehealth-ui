import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import * as schema from "./schema/index";

interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

async function buildConnectionString(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const arn = process.env.DB_SECRET_ARN;
  if (!arn) {
    throw new Error("Either DATABASE_URL or DB_SECRET_ARN must be set");
  }

  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? "us-east-1",
  });
  const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const secret: DbSecret = JSON.parse(response.SecretString ?? "{}");
  return `postgresql://${secret.username}:${secret.password}@${secret.host}:${secret.port}/${secret.dbname}`;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function getDb() {
  if (_db) return _db;

  const connectionString = await buildConnectionString();
  const pool = new Pool({ connectionString, max: 10 });
  _db = drizzle(pool, { schema });
  return _db;
}
