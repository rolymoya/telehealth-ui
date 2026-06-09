import { createHmac, createHash } from "node:crypto";
import {
  type AppDataErrorKind,
  type AppDataKey,
  type AppDataRecord,
  type AppDataResult,
  validateAppDataRecord,
} from "@/lib/dynamodb/app-data";
import type { AppDataReadRepository } from "@/lib/onboarding-status";

type FetchLike = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  },
) => Promise<{
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
}>;

export type DynamoDbAppDataConfig = {
  accessKeyId: string;
  endpoint?: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
  tableName: string;
};

export function resolveDynamoDbAppDataConfig(
  env: Record<string, string | undefined>,
): AppDataResult<DynamoDbAppDataConfig> {
  const stage = env.APOTH_STAGE;
  const tableName = cleanEnv(env.APP_TABLE_NAME) ??
    cleanEnv(env.APOTH_APP_TABLE_NAME) ??
    (stage ? `apoth-${stage}-app` : undefined);
  const region = cleanEnv(env.AWS_REGION) ?? cleanEnv(env.AWS_DEFAULT_REGION);
  const accessKeyId = cleanEnv(env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(env.AWS_SECRET_ACCESS_KEY);

  if (!tableName) {
    return err("validation_failed", "DynamoDB app table name is unavailable");
  }
  if (!region) {
    return err("validation_failed", "AWS region is unavailable");
  }
  if (!accessKeyId || !secretAccessKey) {
    return err("validation_failed", "AWS credentials are unavailable");
  }

  return ok({
    accessKeyId,
    endpoint: cleanEnv(env.APOTH_DYNAMODB_ENDPOINT),
    region,
    secretAccessKey,
    sessionToken: cleanEnv(env.AWS_SESSION_TOKEN),
    tableName,
  });
}

export function createDynamoDbAppDataReadRepository(
  config: DynamoDbAppDataConfig,
  options: { fetch?: FetchLike; now?: () => Date } = {},
): AppDataReadRepository {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async get(key) {
      const body = JSON.stringify({
        ConsistentRead: true,
        Key: {
          pk: { S: key.pk },
          sk: { S: key.sk },
        },
        TableName: config.tableName,
      });

      const request = signDynamoDbRequest({
        body,
        config,
        now: now(),
        target: "DynamoDB_20120810.GetItem",
      });

      try {
        const response = await fetchImpl(request.url, {
          body,
          headers: request.headers,
          method: "POST",
        });
        if (!response.ok) {
          return err("unexpected_client_failure", `DynamoDB GetItem failed with ${response.status}`);
        }

        const parsed = await response.json();
        const item = isRecord(parsed) && isRecord(parsed.Item) ? parsed.Item : null;
        if (!item) {
          return ok(null);
        }

        const unmarshalled = unmarshallRecord(item);
        if (!unmarshalled.ok) {
          return unmarshalled;
        }

        const validated = validateAppDataRecord(unmarshalled.value);
        if (!validated.ok) {
          return validated;
        }

        return ok(validated.value);
      } catch {
        return err("unexpected_client_failure", "DynamoDB GetItem request failed");
      }
    },
  };
}

function signDynamoDbRequest(input: {
  body: string;
  config: DynamoDbAppDataConfig;
  now: Date;
  target: "DynamoDB_20120810.GetItem";
}) {
  const endpoint = new URL(input.config.endpoint ?? `https://dynamodb.${input.config.region}.amazonaws.com`);
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.0",
    host: endpoint.host,
    "x-amz-date": amzDate,
    "x-amz-target": input.target,
  };
  if (input.config.sessionToken) {
    headers["x-amz-security-token"] = input.config.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${headers[name]}`)
    .join("\n");
  const canonicalRequest = [
    "POST",
    endpoint.pathname || "/",
    "",
    `${canonicalHeaders}\n`,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/dynamodb/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(
    input.config.secretAccessKey,
    dateStamp,
    input.config.region,
    "dynamodb",
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  return {
    headers: {
      ...headers,
      authorization: [
        `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders.join(";")}`,
        `Signature=${signature}`,
      ].join(", "),
    },
    url: endpoint.toString(),
  };
}

function unmarshallRecord(item: Record<string, unknown>): AppDataResult<AppDataRecord> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    const unmarshalled = unmarshallAttribute(value);
    if (!unmarshalled.ok) {
      return unmarshalled;
    }
    record[key] = unmarshalled.value;
  }
  return ok(record as AppDataRecord);
}

function unmarshallAttribute(value: unknown): AppDataResult<unknown> {
  if (!isRecord(value)) {
    return err("validation_failed", "Invalid DynamoDB attribute value");
  }
  if (typeof value.S === "string") {
    return ok(value.S);
  }
  if (typeof value.N === "string") {
    const numberValue = Number(value.N);
    return Number.isFinite(numberValue)
      ? ok(numberValue)
      : err("validation_failed", "Invalid DynamoDB number value");
  }
  if (typeof value.BOOL === "boolean") {
    return ok(value.BOOL);
  }
  if (value.NULL === true) {
    return ok(null);
  }
  if (Array.isArray(value.L)) {
    const items: unknown[] = [];
    for (const item of value.L) {
      const unmarshalled = unmarshallAttribute(item);
      if (!unmarshalled.ok) {
        return unmarshalled;
      }
      items.push(unmarshalled.value);
    }
    return ok(items);
  }
  if (isRecord(value.M)) {
    const objectValue: Record<string, unknown> = {};
    for (const [mapKey, mapValue] of Object.entries(value.M)) {
      const unmarshalled = unmarshallAttribute(mapValue);
      if (!unmarshalled.ok) {
        return unmarshalled;
      }
      objectValue[mapKey] = unmarshalled.value;
    }
    return ok(objectValue);
  }
  return err("validation_failed", "Unsupported DynamoDB attribute value");
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, service);
  return hmac(dateRegionServiceKey, "aws4_request");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ok<T>(value: T): AppDataResult<T> {
  return { ok: true, value };
}

function err(kind: AppDataErrorKind, message: string): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
