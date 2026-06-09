import "server-only";

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

export type StartupSecretSource = {
  getSecretValue(kind: SecretKind): Promise<string | null>;
};

export type StartupSecretValidationResult =
  | { ok: true; value: AppSecretPayload[] }
  | { ok: false; error: SecretValidationError };

export type StartupEnvironment = Record<string, string | undefined>;

export function assertServerStartupConfig(input: {
  env: StartupEnvironment;
  requiredSecrets?: SecretKind[];
}) {
  const publicConfig = assertNoPublicSecretConfig(input.env);
  if (!publicConfig.ok) {
    throw new Error(publicConfig.error.message);
  }

  const authConfig = assertOptionalCognitoAuthConfig(input.env);
  if (!authConfig.ok) {
    throw new Error(authConfig.error.message);
  }

  const stage = resolveRuntimeStage(input.env);
  const requiredSecrets = input.requiredSecrets ?? resolveRequiredStartupSecrets(input.env);
  if (
    requiredSecrets.length === 0 ||
    (input.requiredSecrets === undefined && isNextProductionBuild(input.env))
  ) {
    return;
  }

  const secrets = validateEnvStartupSecrets({
    stage,
    requiredSecrets,
    env: input.env,
  });
  if (!secrets.ok) {
    throw new Error(secrets.error.message);
  }
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

function isNextProductionBuild(env: StartupEnvironment) {
  return env.NEXT_PHASE === "phase-production-build";
}
