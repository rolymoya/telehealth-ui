import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";

export type ApiGatewayEvent = {
  body?: string | null;
  cookies?: string[];
  headers?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string | undefined> | null;
  rawPath?: string;
  rawQueryString?: string;
  requestContext?: {
    domainName?: string;
    http?: {
      method?: string;
      path?: string;
      protocol?: string;
      sourceIp?: string;
    };
  };
};

export type ApiGatewayResponse = {
  body: string;
  cookies?: string[];
  headers: Record<string, string>;
  statusCode: number;
};

export type VerifiedPatientSession = {
  cognitoSub: string;
  token: string;
};

export function json(
  statusCode: number,
  body: Record<string, unknown>,
  extra?: { cookies?: string[]; headers?: Record<string, string> },
): ApiGatewayResponse {
  return {
    body: JSON.stringify(body),
    ...(extra?.cookies ? { cookies: extra.cookies } : {}),
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      ...extra?.headers,
    },
    statusCode,
  };
}

export function redirect(statusCode: 302 | 303, location: string): ApiGatewayResponse {
  return {
    body: "",
    headers: {
      "cache-control": "no-store",
      location,
    },
    statusCode,
  };
}

export function header(event: ApiGatewayEvent, name: string) {
  const headers = event.headers ?? {};
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

export function requestOrigin(event: ApiGatewayEvent) {
  return canonicalOrigin(header(event, "origin"));
}

export function isAllowedOrigin(event: ApiGatewayEvent) {
  const origin = requestOrigin(event);
  if (!origin) {
    return true;
  }
  return allowedOrigins().has(origin);
}

export function isSameOriginMutation(event: ApiGatewayEvent) {
  const request = requestBaseOrigin(event);
  if (!request) {
    return false;
  }

  const origin = requestOrigin(event);
  if (origin) {
    return origin === request;
  }

  return canonicalOrigin(header(event, "referer")) === request;
}

export function requestBaseOrigin(event: ApiGatewayEvent) {
  const forwardedProto = header(event, "x-forwarded-proto") ?? "https";
  const forwardedHost = header(event, "x-forwarded-host");
  const host = forwardedHost ?? header(event, "host") ?? event.requestContext?.domainName;
  if (!host) {
    return null;
  }
  return canonicalOrigin(`${forwardedProto}://${host}`);
}

export function localOrConfiguredSiteOrigin(event: ApiGatewayEvent) {
  const configured = canonicalOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) {
    return configured;
  }

  const request = requestBaseOrigin(event);
  if (request && isLocalDevelopmentOrigin(request)) {
    return request;
  }

  return null;
}

export function parseJsonBody(body: string | null | undefined):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false } {
  try {
    const parsed = body ? JSON.parse(body) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ok: true, value: parsed as Record<string, unknown> }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function rawBodyBuffer(event: ApiGatewayEvent, maxBytes: number):
  | { ok: true; value: Buffer }
  | { ok: false } {
  const contentLength = header(event, "content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false };
  }

  const body = event.body ?? "";
  const value = Buffer.from(body, event.isBase64Encoded ? "base64" : "utf8");
  if (value.byteLength > maxBytes) {
    return { ok: false };
  }
  return { ok: true, value };
}

export async function readPatientSession(event: ApiGatewayEvent):
  Promise<
    | { ok: true; session: VerifiedPatientSession }
    | { ok: false; code: string; status: number }
  > {
  const token = parseCookieHeader(cookieHeader(event)).get(patientAccessCookieName);
  if (!token) {
    return { ok: false, code: "authentication_required", status: 401 };
  }

  try {
    const claims = await verifier().verify(token);
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    if (!sub) {
      return { ok: false, code: "authentication_required", status: 401 };
    }
    return {
      ok: true,
      session: {
        cognitoSub: sub,
        token,
      },
    };
  } catch {
    return { ok: false, code: "authentication_required", status: 401 };
  }
}

function verifier() {
  return CognitoJwtVerifier.create({
    clientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    tokenUse: "access",
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
  });
}

function cookieHeader(event: ApiGatewayEvent) {
  const explicit = header(event, "cookie");
  const cookies = event.cookies?.join("; ");
  return [explicit, cookies].filter(Boolean).join("; ");
}

function allowedOrigins() {
  const values = [
    process.env.APOTH_ALLOWED_ORIGIN,
    ...(process.env.APOTH_ALLOWED_ORIGINS ?? "").split(","),
  ];
  return new Set(values.map((value) => canonicalOrigin(value)).filter(Boolean) as string[]);
}

function canonicalOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin: string) {
  const url = new URL(origin);
  return url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
}

export function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
