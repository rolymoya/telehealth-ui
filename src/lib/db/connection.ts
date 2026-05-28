import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Pool } from "pg";

interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

function validateSecret(s: unknown): DbSecret {
  if (!s || typeof s !== "object") throw new Error("DB secret is not a valid JSON object");
  const secret = s as Record<string, unknown>;
  for (const field of ["username", "password", "host", "dbname"] as const) {
    if (!secret[field] || typeof secret[field] !== "string") {
      throw new Error(`DB secret is missing required field: ${field}`);
    }
  }
  if (!secret.port || typeof secret.port !== "number") {
    throw new Error("DB secret is missing required field: port (must be a number)");
  }
  return s as DbSecret;
}

export async function getConnectionString(): Promise<{ url: string; ssl: boolean }> {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, ssl: false };
  }

  const arn = process.env.DB_SECRET_ARN;
  if (!arn) {
    throw new Error("Either DATABASE_URL or DB_SECRET_ARN must be set");
  }

  const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const response = await sm.send(new GetSecretValueCommand({ SecretId: arn }));

  if (!response.SecretString) {
    throw new Error("DB_SECRET_ARN secret has no SecretString value (binary secrets are not supported)");
  }

  const raw: unknown = JSON.parse(response.SecretString);
  const secret = validateSecret(raw);

  // encodeURIComponent prevents special chars in credentials from corrupting the URL
  const url = `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port}/${secret.dbname}`;
  return { url, ssl: true };
}

export function createPool(url: string, ssl: boolean, max: number): Pool {
  return new Pool({
    connectionString: url,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl: ssl ? { rejectUnauthorized: true } : false,
  });
}
