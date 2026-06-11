import "server-only";

import {
  parseSecretPayload,
  type SecretValidationErrorKind,
} from "@/lib/secrets";
import type { MdiApiSecretPayload, RuntimeStage } from "@/lib/secrets/contracts";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  type StartupEnvironment,
  type StartupSecretSource,
} from "@/lib/secrets/startup";

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

export type MdiTokenErrorCode =
  | "missing_secret"
  | "invalid_secret"
  | "token_request_failed"
  | "invalid_token_response"
  | "token_retry_failed";

export type MdiTokenResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: MdiTokenErrorCode;
        message: string;
        status?: number;
      };
    };

export type MdiAccessToken = {
  accessToken: string;
  apiBaseUrl: string;
  expiresAtMs: number;
};

export type MdiTokenClientOptions = {
  allowFakeSecretValuesForTests?: boolean;
  env?: StartupEnvironment;
  fetch?: FetchLike;
  now?: () => Date;
  secretSource?: StartupSecretSource;
  stage?: RuntimeStage;
};

type MdiAuthorizedResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; status?: number } };

type TokenCacheEntry = MdiAccessToken & {
  refreshAtMs: number;
  scope: string;
  stage: RuntimeStage;
};

const defaultTokenTtlSeconds = 300;
const refreshSkewMs = 60_000;

let cachedToken: TokenCacheEntry | null = null;
let inFlightToken:
  | {
      promise: Promise<MdiTokenResult<MdiAccessToken>>;
      scope: string;
    }
  | null = null;

export async function getMdiAccessToken(
  options: MdiTokenClientOptions = {},
): Promise<MdiTokenResult<MdiAccessToken>> {
  return getOrRequestMdiAccessToken(options, { forceRefresh: false });
}

export async function refreshMdiAccessToken(
  options: MdiTokenClientOptions = {},
): Promise<MdiTokenResult<MdiAccessToken>> {
  return getOrRequestMdiAccessToken(options, { forceRefresh: true });
}

export async function withMdiTokenRefreshRetry<T>(
  request: (token: MdiAccessToken) => Promise<MdiAuthorizedResult<T>>,
  options: MdiTokenClientOptions = {},
): Promise<MdiAuthorizedResult<T>> {
  const firstToken = await getMdiAccessToken(options);
  if (!firstToken.ok) {
    return firstToken;
  }

  const first = await request(firstToken.value);
  if (first.ok || first.error.status !== 401) {
    return first;
  }

  const refreshedToken = await refreshMdiAccessToken(options);
  if (!refreshedToken.ok) {
    return refreshedToken;
  }

  const retry = await request(refreshedToken.value);
  if (retry.ok || retry.error.status !== 401) {
    return retry;
  }

  return err("token_retry_failed", "MDI request remained unauthorized after token refresh", 401);
}

export function resetMdiTokenCacheForTests() {
  cachedToken = null;
  inFlightToken = null;
}

async function getOrRequestMdiAccessToken(
  options: MdiTokenClientOptions,
  input: { forceRefresh: boolean },
): Promise<MdiTokenResult<MdiAccessToken>> {
  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const stage = resolveMdiStage(options);
  if (!stage.ok) {
    return stage;
  }

  if (
    !input.forceRefresh &&
    cachedToken?.stage === stage.value &&
    cachedToken.refreshAtMs > nowMs
  ) {
    return {
      ok: true,
      value: publicToken(cachedToken),
    };
  }

  const acquisitionScope = `${stage.value}:mdiApi`;
  if (!input.forceRefresh && inFlightToken?.scope === acquisitionScope) {
    return inFlightToken.promise;
  }

  const promise = loadAndRequestMdiAccessToken(options, {
    nowMs,
    stage: stage.value,
  });
  inFlightToken = { promise, scope: acquisitionScope };

  try {
    const result = await promise;
    if (result.ok) {
      const ttlMs = Math.max(0, result.value.expiresAtMs - nowMs);
      cachedToken = {
        ...result.value,
        refreshAtMs: nowMs + refreshWindowMs(ttlMs),
        scope: cacheScope(stage.value, result.value.apiBaseUrl),
        stage: stage.value,
      };
    }
    return result;
  } finally {
    if (inFlightToken?.promise === promise) {
      inFlightToken = null;
    }
  }
}

async function loadAndRequestMdiAccessToken(
  options: MdiTokenClientOptions,
  input: { nowMs: number; stage: RuntimeStage },
) {
  const secret = await loadMdiSecret(options, input.stage);
  if (!secret.ok) {
    return secret;
  }

  return requestMdiAccessToken(secret.value, options, input.nowMs);
}

async function loadMdiSecret(
  options: MdiTokenClientOptions,
  stage: RuntimeStage,
): Promise<MdiTokenResult<MdiApiSecretPayload>> {
  const env = options.env ?? process.env;
  let source = options.secretSource;
  if (!source) {
    const resolved = resolveStartupSecretSource({
      env,
      requiredSecrets: ["mdiApi"],
    });
    if (!resolved.ok) {
      return err(mapSecretErrorCode(resolved.error.kind), resolved.error.message);
    }
    source = resolved.value.source;
  }

  let raw: string | null;
  try {
    raw = await source.getSecretValue("mdiApi");
  } catch {
    return err("invalid_secret", "MDI API secret could not be loaded");
  }
  if (!raw) {
    return err("missing_secret", "MDI API secret is missing");
  }

  const parsed = parseSecretPayload(raw, {
    allowFakeValues: options.allowFakeSecretValuesForTests,
    expectedKind: "mdiApi",
    expectedStage: stage,
  });
  if (!parsed.ok) {
    return err(mapSecretErrorCode(parsed.error.kind), parsed.error.message);
  }
  if (parsed.value.secretKind !== "mdiApi") {
    return err("invalid_secret", "MDI API secret has the wrong kind");
  }

  return { ok: true, value: parsed.value };
}

async function requestMdiAccessToken(
  secret: MdiApiSecretPayload,
  options: MdiTokenClientOptions,
  nowMs: number,
): Promise<MdiTokenResult<MdiAccessToken>> {
  const fetchImpl = options.fetch ?? fetch;
  const body = new URLSearchParams({
    client_id: secret.clientId,
    client_secret: secret.clientSecret,
    grant_type: "client_credentials",
  }).toString();

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(tokenEndpoint(secret.apiBaseUrl), {
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
  } catch {
    return err("token_request_failed", "MDI token request failed");
  }

  if (!response.ok) {
    return err("token_request_failed", "MDI token request failed", response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return err("invalid_token_response", "MDI token response was invalid JSON", response.status);
  }

  if (!isRecord(payload) || typeof payload.access_token !== "string" || payload.access_token.trim() === "") {
    return err("invalid_token_response", "MDI token response is missing access_token", response.status);
  }

  const expiresIn = payload.expires_in;
  if (
    expiresIn !== undefined &&
    (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0)
  ) {
    return err("invalid_token_response", "MDI token response has invalid expiry", response.status);
  }

  const ttlSeconds = typeof expiresIn === "number" ? expiresIn : defaultTokenTtlSeconds;
  return {
    ok: true,
    value: {
      accessToken: payload.access_token.trim(),
      apiBaseUrl: secret.apiBaseUrl,
      expiresAtMs: nowMs + ttlSeconds * 1000,
    },
  };
}

function resolveMdiStage(
  options: MdiTokenClientOptions,
): MdiTokenResult<RuntimeStage> {
  try {
    return {
      ok: true,
      value: options.stage ?? resolveRuntimeStage(options.env ?? process.env),
    };
  } catch {
    return err("invalid_secret", "MDI secret stage configuration is invalid");
  }
}

function refreshWindowMs(ttlMs: number) {
  if (ttlMs <= 0) {
    return 0;
  }
  return Math.max(1000, ttlMs - Math.min(refreshSkewMs, Math.floor(ttlMs / 2)));
}

function tokenEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/partner/auth/token`;
}

function publicToken(entry: TokenCacheEntry): MdiAccessToken {
  return {
    accessToken: entry.accessToken,
    apiBaseUrl: entry.apiBaseUrl,
    expiresAtMs: entry.expiresAtMs,
  };
}

function cacheScope(stage: RuntimeStage, apiBaseUrl: string) {
  return `${stage}:${apiBaseUrl}`;
}

function mapSecretErrorCode(kind: SecretValidationErrorKind): MdiTokenErrorCode {
  return kind === "missing_secret" ? "missing_secret" : "invalid_secret";
}

function err(
  code: MdiTokenErrorCode,
  message: string,
  status?: number,
): MdiTokenResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(status ? { status } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
