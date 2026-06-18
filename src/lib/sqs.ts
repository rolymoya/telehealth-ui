import "server-only";

import { createHmac, createHash } from "node:crypto";
import type { WebhookQueueMessage } from "@/lib/webhooks";

type FetchLike = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  },
) => Promise<{ ok: boolean; status: number }>;

export type SqsQueueConfig = {
  accessKeyId: string;
  queueUrl: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type SqsConfigResult =
  | { ok: true; value: SqsQueueConfig }
  | { ok: false; error: string };

export function resolveWebhookQueueConfig(
  env: Record<string, string | undefined>,
): SqsConfigResult {
  const queueUrl = cleanEnv(env.APOTH_WEBHOOK_QUEUE_URL) ?? cleanEnv(env.WEBHOOK_QUEUE_URL);
  const region = cleanEnv(env.AWS_REGION) ?? cleanEnv(env.AWS_DEFAULT_REGION);
  const accessKeyId = cleanEnv(env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(env.AWS_SECRET_ACCESS_KEY);

  if (!queueUrl) {
    return { ok: false, error: "Webhook queue URL is unavailable" };
  }
  if (!region) {
    return { ok: false, error: "AWS region is unavailable" };
  }
  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, error: "AWS credentials are unavailable" };
  }

  return {
    ok: true,
    value: {
      accessKeyId,
      queueUrl,
      region,
      secretAccessKey,
      sessionToken: cleanEnv(env.AWS_SESSION_TOKEN),
    },
  };
}

export function createSqsWebhookEnqueue(
  config: SqsQueueConfig,
  options: { fetch?: FetchLike; now?: () => Date } = {},
) {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  return async (message: WebhookQueueMessage) => {
    const body = new URLSearchParams({
      Action: "SendMessage",
      MessageBody: JSON.stringify(message),
      Version: "2012-11-05",
    }).toString();
    const request = signSqsRequest({
      body,
      config,
      now: now(),
    });
    const response = await fetchImpl(config.queueUrl, {
      body,
      headers: request.headers,
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`SQS SendMessage failed with ${response.status}`);
    }
  };
}

function signSqsRequest(input: {
  body: string;
  config: SqsQueueConfig;
  now: Date;
}) {
  const endpoint = new URL(input.config.queueUrl);
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    host: endpoint.host,
    "x-amz-date": amzDate,
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
    endpoint.pathname,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/sqs/aws4_request`;
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
    "sqs",
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
  };
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
