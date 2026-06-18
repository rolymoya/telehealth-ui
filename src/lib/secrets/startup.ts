import "server-only";

import { createHmac, createHash } from "node:crypto";
import {
  assertNoPublicSecretConfig,
  parseSecretPayload,
  type SecretValidationError,
} from ".";
import {
  cognitoAuthEnv,
  resolveCognitoAuthConfig,
} from "../auth";
import type {
  AppSecretPayload,
  RuntimeStage,
  SecretKind,
} from "./contracts";

type FetchLike = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type StartupSecretSource = {
  getSecretValue(kind: SecretKind): Promise<string | null>;
};

export type AwsSecretsManagerStartupConfig = {
  accessKeyId: string;
  region: string;
  secretAccessKey: string;
  secretIdentifiers: Partial<Record<SecretKind, string>>;
  sessionToken?: string;
};

export type StartupSecretSourceResolution =
  | {
      ok: true;
      value:
        | { kind: "awsSecretsManager"; source: StartupSecretSource }
        | { kind: "envPayload"; source: StartupSecretSource };
    }
  | { ok: false; error: SecretValidationError };

export type StartupSecretValidationResult =
  | { ok: true; value: AppSecretPayload[] }
  | { ok: false; error: SecretValidationError };

export type StartupEnvironment = Record<string, string | undefined>;

export function assertPublicServerStartupConfig(input: {
  env: StartupEnvironment;
}) {
  assertBaseServerStartupConfig(input.env);
}

export function assertServerStartupConfig(input: {
  env: StartupEnvironment;
  requiredSecrets?: SecretKind[];
}) {
  const stage = assertBaseServerStartupConfig(input.env);
  const requiredSecrets = input.requiredSecrets ?? resolveRequiredStartupSecrets(input.env);
  if (
    requiredSecrets.length === 0 ||
    (input.requiredSecrets === undefined && isNextProductionBuild(input.env))
  ) {
    return;
  }

  const source = resolveStartupSecretSource({
    requiredSecrets,
    env: input.env,
  });
  if (!source.ok) {
    throw new Error(source.error.message);
  }
  if (source.value.kind === "envPayload") {
    const secrets = validateEnvStartupSecrets({
      stage,
      requiredSecrets,
      env: input.env,
    });
    if (!secrets.ok) {
      throw new Error(secrets.error.message);
    }
  }
}

function assertBaseServerStartupConfig(env: StartupEnvironment) {
  const publicConfig = assertNoPublicSecretConfig(env);
  if (!publicConfig.ok) {
    throw new Error(publicConfig.error.message);
  }

  const authConfig = assertOptionalCognitoAuthConfig(env);
  if (!authConfig.ok) {
    throw new Error(authConfig.error.message);
  }

  return resolveRuntimeStage(env);
}

export async function validateServerStartupSecrets(input: {
  stage: RuntimeStage;
  requiredSecrets: SecretKind[];
  source: StartupSecretSource;
}): Promise<StartupSecretValidationResult> {
  const secrets: AppSecretPayload[] = [];
  const values = await Promise.all(
    input.requiredSecrets.map(async (kind) => {
      try {
        return { kind, raw: await input.source.getSecretValue(kind) };
      } catch {
        return { kind, error: true };
      }
    }),
  );

  for (const value of values) {
    if ("error" in value) {
      return {
        ok: false,
        error: {
          kind: "invalid_secret",
          message: `Required secret ${value.kind} could not be loaded`,
        },
      };
    }

    const { kind, raw } = value;
    if (!raw) {
      return {
        ok: false,
        error: {
          kind: "missing_secret",
          message: `Required secret ${kind} is missing`,
        },
      };
    }

    const parsed = parseSecretPayload(raw, {
      expectedStage: input.stage,
      expectedKind: kind,
    });
    if (!parsed.ok) {
      return parsed;
    }

    secrets.push(parsed.value);
  }

  return { ok: true, value: secrets };
}

export function validateEnvStartupSecrets(input: {
  stage: RuntimeStage;
  requiredSecrets: SecretKind[];
  env: StartupEnvironment;
}): StartupSecretValidationResult {
  return validateStartupSecretValues({
    stage: input.stage,
    requiredSecrets: input.requiredSecrets,
    getSecretValue: (kind) => input.env[secretPayloadEnvName(kind)] ?? null,
  });
}

export async function validateConfiguredServerStartupSecrets(input: {
  env: StartupEnvironment;
  requiredSecrets?: SecretKind[];
}): Promise<StartupSecretValidationResult> {
  const stage = resolveRuntimeStage(input.env);
  const requiredSecrets = input.requiredSecrets ?? resolveRequiredStartupSecrets(input.env);
  if (
    requiredSecrets.length === 0 ||
    (input.requiredSecrets === undefined && isNextProductionBuild(input.env))
  ) {
    return { ok: true, value: [] };
  }

  const source = resolveStartupSecretSource({
    env: input.env,
    requiredSecrets,
  });
  if (!source.ok) {
    return source;
  }

  return validateServerStartupSecrets({
    stage,
    requiredSecrets,
    source: source.value.source,
  });
}

export function resolveStartupSecretSource(input: {
  env: StartupEnvironment;
  requiredSecrets: SecretKind[];
}): StartupSecretSourceResolution {
  const fallbackToEnvPayload = parseAllowEnvSecretPayloadsFlag(input.env);
  const missingIdentifier = input.requiredSecrets.find(
    (kind) => cleanEnv(input.env[secretIdentifierEnvName(kind)]) === undefined,
  );
  if (missingIdentifier === undefined) {
    const config = resolveAwsSecretsManagerStartupConfig(input.env, input.requiredSecrets);
    if (!config.ok) {
      return config;
    }
    return {
      ok: true,
      value: {
        kind: "awsSecretsManager",
        source: createAwsSecretsManagerStartupSecretSource(config.value),
      },
    };
  }

  if (fallbackToEnvPayload) {
    return {
      ok: true,
      value: {
        kind: "envPayload",
        source: createEnvStartupSecretSource(input.env),
      },
    };
  }

  return {
    ok: false,
    error: {
      kind: "missing_secret",
      message: `Required secret ${missingIdentifier} identifier is missing`,
    },
  };
}

export function resolveAwsSecretsManagerStartupConfig(
  env: StartupEnvironment,
  requiredSecrets: SecretKind[],
): { ok: true; value: AwsSecretsManagerStartupConfig } | { ok: false; error: SecretValidationError } {
  const region = cleanEnv(env.AWS_REGION) ?? cleanEnv(env.AWS_DEFAULT_REGION);
  const accessKeyId = cleanEnv(env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(env.AWS_SECRET_ACCESS_KEY);
  if (!region) {
    return invalidRuntimeSecretConfig("AWS region is unavailable for Secrets Manager");
  }
  if (!accessKeyId || !secretAccessKey) {
    return invalidRuntimeSecretConfig("AWS credentials are unavailable for Secrets Manager");
  }

  const secretIdentifiers: Partial<Record<SecretKind, string>> = {};
  for (const kind of requiredSecrets) {
    const identifier = cleanEnv(env[secretIdentifierEnvName(kind)]);
    if (!identifier) {
      return {
        ok: false,
        error: {
          kind: "missing_secret",
          message: `Required secret ${kind} identifier is missing`,
        },
      };
    }
    secretIdentifiers[kind] = identifier;
  }

  return {
    ok: true,
    value: {
      accessKeyId,
      region,
      secretAccessKey,
      secretIdentifiers,
      sessionToken: cleanEnv(env.AWS_SESSION_TOKEN),
    },
  };
}

export function createAwsSecretsManagerStartupSecretSource(
  config: AwsSecretsManagerStartupConfig,
  options: { fetch?: FetchLike; now?: () => Date } = {},
): StartupSecretSource {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    async getSecretValue(kind) {
      const secretId = config.secretIdentifiers[kind];
      if (!secretId) {
        return null;
      }
      const body = JSON.stringify({ SecretId: secretId });
      const signed = signSecretsManagerRequest({
        body,
        config,
        now: now(),
      });
      const response = await fetchImpl(`https://secretsmanager.${config.region}.amazonaws.com/`, {
        body,
        headers: signed.headers,
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Secrets Manager GetSecretValue failed with ${response.status}`);
      }
      const payload = await response.json();
      if (!isRecord(payload)) {
        return null;
      }
      if (typeof payload.SecretString === "string") {
        return payload.SecretString;
      }
      if (typeof payload.SecretBinary === "string") {
        return Buffer.from(payload.SecretBinary, "base64").toString("utf8");
      }
      return null;
    },
  };
}

export function createEnvStartupSecretSource(env: StartupEnvironment): StartupSecretSource {
  return {
    async getSecretValue(kind) {
      return env[secretPayloadEnvName(kind)] ?? null;
    },
  };
}

export function resolveRequiredStartupSecrets(env: StartupEnvironment): SecretKind[] {
  if (env.APOTH_REQUIRED_SERVER_SECRETS) {
    return parseRequiredSecretKinds(env.APOTH_REQUIRED_SERVER_SECRETS);
  }
  if (
    parseRequireServerSecretsFlag(env) ||
    env.APOTH_STAGE === "production" ||
    env.NODE_ENV === "production"
  ) {
    return ["mdiApi", "stripeApi", "appSigning"];
  }
  return [];
}

export function resolveRuntimeStage(env: StartupEnvironment): RuntimeStage {
  if (env.APOTH_STAGE === undefined) {
    if (env.NODE_ENV === "production") {
      throw new Error("APOTH_STAGE must be set in production");
    }
    return "staging";
  }
  if (env.APOTH_STAGE === "staging") {
    return "staging";
  }
  if (env.APOTH_STAGE === "production") {
    return "production";
  }
  throw new Error(`Unsupported APOTH_STAGE: ${env.APOTH_STAGE}`);
}

export function secretIdentifierEnvName(kind: SecretKind) {
  switch (kind) {
    case "mdiApi":
      return "APOTH_SECRET_MDI_API_ID";
    case "stripeApi":
      return "APOTH_SECRET_STRIPE_API_ID";
    case "appSigning":
      return "APOTH_SECRET_APP_SIGNING_ID";
  }
}

export function secretPayloadEnvName(kind: SecretKind) {
  switch (kind) {
    case "mdiApi":
      return "APOTH_SECRET_MDI_API_JSON";
    case "stripeApi":
      return "APOTH_SECRET_STRIPE_API_JSON";
    case "appSigning":
      return "APOTH_SECRET_APP_SIGNING_JSON";
  }
}

function signSecretsManagerRequest(input: {
  body: string;
  config: AwsSecretsManagerStartupConfig;
  now: Date;
}) {
  const endpoint = new URL(`https://secretsmanager.${input.config.region}.amazonaws.com/`);
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    host: endpoint.host,
    "x-amz-date": amzDate,
    "x-amz-target": "secretsmanager.GetSecretValue",
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
  const credentialScope = `${dateStamp}/${input.config.region}/secretsmanager/aws4_request`;
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
    "secretsmanager",
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

function validateStartupSecretValues(input: {
  stage: RuntimeStage;
  requiredSecrets: SecretKind[];
  getSecretValue(kind: SecretKind): string | null;
}): StartupSecretValidationResult {
  const secrets: AppSecretPayload[] = [];

  for (const kind of input.requiredSecrets) {
    const raw = input.getSecretValue(kind);
    if (!raw) {
      return {
        ok: false,
        error: {
          kind: "missing_secret",
          message: `Required secret ${kind} is missing`,
        },
      };
    }

    const parsed = parseSecretPayload(raw, {
      expectedStage: input.stage,
      expectedKind: kind,
    });
    if (!parsed.ok) {
      return parsed;
    }

    secrets.push(parsed.value);
  }

  return { ok: true, value: secrets };
}

function assertOptionalCognitoAuthConfig(env: StartupEnvironment) {
  const hasAnyCognitoConfig = Object.values(cognitoAuthEnv).some(
    (envName) => env[envName] !== undefined,
  );
  if (!hasAnyCognitoConfig) {
    return { ok: true as const, value: undefined };
  }
  return resolveCognitoAuthConfig(env);
}

function parseRequiredSecretKinds(value: string): SecretKind[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("APOTH_REQUIRED_SERVER_SECRETS must include at least one secret kind");
  }

  return entries.map((entry) => {
    if (
      entry === "mdiApi" ||
      entry === "stripeApi" ||
      entry === "appSigning"
    ) {
      return entry;
    }
    throw new Error(`Unsupported required secret kind: ${entry}`);
  });
}

function parseRequireServerSecretsFlag(env: StartupEnvironment) {
  if (env.APOTH_REQUIRE_SERVER_SECRETS === undefined) {
    return false;
  }
  if (env.APOTH_REQUIRE_SERVER_SECRETS === "true") {
    return true;
  }
  if (env.APOTH_REQUIRE_SERVER_SECRETS === "false") {
    return false;
  }
  throw new Error("APOTH_REQUIRE_SERVER_SECRETS must be true or false");
}

function parseAllowEnvSecretPayloadsFlag(env: StartupEnvironment) {
  if (env.APOTH_ALLOW_ENV_SECRET_PAYLOADS === undefined) {
    return false;
  }
  if (env.APOTH_ALLOW_ENV_SECRET_PAYLOADS === "true") {
    return true;
  }
  if (env.APOTH_ALLOW_ENV_SECRET_PAYLOADS === "false") {
    return false;
  }
  throw new Error("APOTH_ALLOW_ENV_SECRET_PAYLOADS must be true or false");
}

function isNextProductionBuild(env: StartupEnvironment) {
  return env.NEXT_PHASE === "phase-production-build";
}

function invalidRuntimeSecretConfig(message: string) {
  return {
    ok: false as const,
    error: {
      kind: "invalid_secret" as const,
      message,
    },
  };
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

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, service);
  return hmac(dateRegionServiceKey, "aws4_request");
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
