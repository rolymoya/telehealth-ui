import "server-only";

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  getServerSession,
  resolveCognitoAuthConfig,
  type CognitoAuthConfig,
  type PatientAuthSession,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
  type DynamoDbAppDataRepository,
} from "@/lib/dynamodb/app-data-dynamodb";

export type PatientRouteSession = {
  config: CognitoAuthConfig;
  session: PatientAuthSession;
  token: string;
};

export type RouteResult<T> =
  | { ok: true; value: T }
  | { ok: false; body: Record<string, unknown>; status: number };

export async function readPatientRouteSession(
  request: NextRequest,
  unavailableCode = "onboarding_unavailable",
): Promise<RouteResult<PatientRouteSession>> {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    return routeFailure({ error: unavailableCode }, 503);
  }

  const token = request.cookies.get(patientAccessCookieName)?.value ?? "";
  const session = await getServerSession({
    config: config.value,
    token,
  });
  if (!session.ok) {
    return routeFailure({ error: "authentication_required" }, 401);
  }

  return {
    ok: true,
    value: {
      config: config.value,
      session: session.value,
      token,
    },
  };
}

export function readPatientRouteToken(request: NextRequest) {
  return request.cookies.get(patientAccessCookieName)?.value ?? "";
}

export function resolveAppDataRepository(
  env: Record<string, string | undefined> = process.env,
): RouteResult<DynamoDbAppDataRepository> {
  const config = resolveDynamoDbAppDataConfig(env);
  if (!config.ok) {
    return routeFailure({ error: "onboarding_unavailable" }, 503);
  }

  return {
    ok: true,
    value: createDynamoDbAppDataRepository(config.value),
  };
}

export async function verifyJsonMutation(
  request: NextRequest,
  input: {
    csrfScope: string;
    unavailableCode?: string;
  },
): Promise<RouteResult<PatientRouteSession>> {
  if (!isSameOriginMutation(request)) {
    return routeFailure({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return routeFailure({ code: "invalid_content_type" }, 415);
  }

  const session = await readPatientRouteSession(request, input.unavailableCode);
  if (!session.ok) {
    return session.status === 401
      ? routeFailure({ code: "authentication_required" }, 401)
      : session;
  }

  const csrf = request.headers.get("x-apoth-csrf") ?? "";
  if (csrf !== csrfTokenFor(input.csrfScope, session.value.token)) {
    return routeFailure({ code: "invalid_csrf" }, 403);
  }

  return session;
}

export async function readJsonObject(request: NextRequest) {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function csrfTokenFor(scope: string, token: string) {
  return createHash("sha256")
    .update(`${scope}:${token}`)
    .digest("base64url");
}

export function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, private",
    },
    status,
  });
}

export function routeFailure(body: Record<string, unknown>, status: number) {
  return { ok: false as const, body, status };
}

export function isSameOriginMutation(request: NextRequest) {
  const requestOrigin = originFromUrl(request.nextUrl.origin);
  if (!requestOrigin) {
    return false;
  }

  const origin = originFromUrl(request.headers.get("origin"));
  if (origin) {
    return origin === requestOrigin;
  }

  const referer = originFromUrl(request.headers.get("referer"));
  return referer === requestOrigin;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRequest(request: NextRequest) {
  return /^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "");
}

function originFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
