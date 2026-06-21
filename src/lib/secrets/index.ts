import "server-only";

import {
  fakeSecretPrefix,
  secretContracts,
  type AppSecretPayload,
  type RuntimeStage,
  type SecretKind,
} from "./contracts";

export type SecretValidationErrorKind =
  | "malformed_json"
  | "invalid_secret"
  | "wrong_stage"
  | "missing_secret"
  | "placeholder_value";

export type SecretValidationError = {
  kind: SecretValidationErrorKind;
  message: string;
};

type SecretResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SecretValidationError };

export type SecretValidationResult<T extends AppSecretPayload = AppSecretPayload> =
  SecretResult<T>;

export function parseSecretPayload(
  raw: string,
  options: {
    expectedStage: RuntimeStage;
    expectedKind: SecretKind;
    allowFakeValues?: boolean;
  },
): SecretValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err("malformed_json", `Secret ${options.expectedKind} is not valid JSON`);
  }

  return validateSecretPayload(parsed, options);
}

export function validateSecretPayload(
  payload: unknown,
  options: {
    expectedStage: RuntimeStage;
    expectedKind: SecretKind;
    allowFakeValues?: boolean;
  },
): SecretValidationResult {
  if (!isRecord(payload)) {
    return err("invalid_secret", `Secret ${options.expectedKind} must be an object`);
  }

  const base = validateBaseFields(payload, options);
  if (!base.ok) {
    return base;
  }

  const allowedFields = new Set(
    secretContracts[options.expectedKind].fields.map((field) => field.name),
  );
  for (const field of Object.keys(payload)) {
    if (!allowedFields.has(field)) {
      return err("invalid_secret", `Secret ${options.expectedKind} contains an unknown field`);
    }
  }

  const normalizedPayload = { ...payload };

  for (const contractField of secretContracts[options.expectedKind].fields) {
    const field = contractField.name;
    if (!shouldValidateStringField(field, contractField.confidential)) {
      continue;
    }

    const value = payload[field];
    if (value === undefined) {
      if ("required" in contractField && contractField.required === false) {
        continue;
      }
      return err("invalid_secret", `Secret ${options.expectedKind} is missing ${field}`);
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      return err("invalid_secret", `Secret ${options.expectedKind} is missing ${field}`);
    }
    const trimmed = value.trim();
    normalizedPayload[field] = trimmed;

    const isPlaceholder = isPlaceholderValue(trimmed);
    if (options.allowFakeValues && contractField.confidential && !trimmed.startsWith(fakeSecretPrefix)) {
      return err("placeholder_value", `Secret ${options.expectedKind} test value for ${field} must use ${fakeSecretPrefix}`);
    }
    if (!options.allowFakeValues && isPlaceholder) {
      return err("placeholder_value", `Secret ${options.expectedKind} contains an unpopulated placeholder for ${field}`);
    }
  }

  const rotationWindow = validateRotationWindow(normalizedPayload, options.expectedKind);
  if (!rotationWindow.ok) {
    return rotationWindow;
  }

  if (options.expectedKind === "mdiApi") {
    const apiBaseUrl = normalizedPayload.apiBaseUrl;
    if (typeof apiBaseUrl !== "string" || !isHttpsUrl(apiBaseUrl)) {
      return err("invalid_secret", "Secret mdiApi apiBaseUrl must be an HTTPS URL");
    }
  }

  return ok(normalizedPayload as AppSecretPayload);
}

export function assertNoPublicSecretConfig(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("NEXT_PUBLIC_") || value === undefined) {
      continue;
    }
    const normalized = key.toLowerCase();
    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("webhook") ||
      normalized.includes("stripe_key") ||
      containsSecretLikeValue(value)
    ) {
      return err(
        "invalid_secret",
        `Public environment variable ${key} must not contain secret material`,
      );
    }
  }

  return ok(undefined);
}

function shouldValidateStringField(field: string, confidential: boolean) {
  return confidential || field === "apiBaseUrl" || field.endsWith("ExpiresAt");
}

function validateRotationWindow(
  payload: Record<string, unknown>,
  expectedKind: SecretKind,
): SecretResult<void> {
  if (expectedKind === "mdiApi") {
    return validatePreviousSecretWindow(payload, {
      currentField: "webhookSigningSecret",
      previousField: "webhookSigningSecretPrevious",
      expiresAtField: "webhookSigningSecretPreviousExpiresAt",
      label: "webhook signing secret",
      kind: expectedKind,
    });
  }

  if (expectedKind === "stripeApi") {
    return validatePreviousSecretWindow(payload, {
      currentField: "webhookSigningSecret",
      previousField: "webhookSigningSecretPrevious",
      expiresAtField: "webhookSigningSecretPreviousExpiresAt",
      label: "webhook signing secret",
      kind: expectedKind,
    });
  }

  if (expectedKind === "appSigning") {
    return validatePreviousSecretWindow(payload, {
      currentField: "signingSecret",
      previousField: "signingSecretPrevious",
      expiresAtField: "signingSecretPreviousExpiresAt",
      label: "signing secret",
      kind: expectedKind,
    });
  }

  return ok(undefined);
}

function validatePreviousSecretWindow(
  payload: Record<string, unknown>,
  options: {
    currentField: string;
    previousField: string;
    expiresAtField: string;
    label: string;
    kind: SecretKind;
  },
): SecretResult<void> {
  const current = payload[options.currentField];
  const previous = payload[options.previousField];
  const expiresAt = payload[options.expiresAtField];

  if (previous === undefined && expiresAt === undefined) {
    return ok(undefined);
  }
  if (typeof previous !== "string" || typeof expiresAt !== "string") {
    return err(
      "invalid_secret",
      `Secret ${options.kind} previous ${options.label} window is incomplete`,
    );
  }
  if (typeof current === "string" && current === previous) {
    return err(
      "invalid_secret",
      `Secret ${options.kind} previous ${options.label} must differ from current`,
    );
  }
  if (!isIsoTimestamp(expiresAt)) {
    return err(
      "invalid_secret",
      `Secret ${options.kind} previous ${options.label} expiry must be an ISO timestamp`,
    );
  }

  return ok(undefined);
}

function validateBaseFields(
  payload: Record<string, unknown>,
  options: {
    expectedStage: RuntimeStage;
    expectedKind: SecretKind;
  },
): SecretResult<void> {
  if (
    payload.apothStage !== "staging" &&
    payload.apothStage !== "production"
  ) {
    return err("invalid_secret", `Secret ${options.expectedKind} has an invalid Apoth stage sentinel`);
  }
  if (payload.apothStage !== options.expectedStage) {
    return err("wrong_stage", `Secret ${options.expectedKind} is tagged for the wrong Apoth stage`);
  }
  if (payload.secretKind !== options.expectedKind) {
    return err("invalid_secret", `Secret ${options.expectedKind} has the wrong kind`);
  }
  if (payload.schemaVersion !== 1) {
    return err("invalid_secret", `Secret ${options.expectedKind} has an unsupported schema version`);
  }

  return ok(undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function isPlaceholderValue(value: string) {
  return value.startsWith(fakeSecretPrefix) || value.includes(".invalid");
}

function containsSecretLikeValue(value: string) {
  return secretValuePatterns.some((pattern) => pattern.test(value));
}

const secretValuePatterns = [
  /sk_(live|test)_[A-Za-z0-9]+/,
  /rk_(live|test)_[A-Za-z0-9]+/,
  /whsec_[A-Za-z0-9]+/,
  /AKIA[0-9A-Z]{16}/,
  /ASIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /bearer\s+[A-Za-z0-9._-]{16,}/i,
];

function ok<T>(value: T): SecretResult<T> {
  return { ok: true, value };
}

function err(
  kind: SecretValidationErrorKind,
  message: string,
): SecretResult<never> {
  return { ok: false, error: { kind, message } };
}
