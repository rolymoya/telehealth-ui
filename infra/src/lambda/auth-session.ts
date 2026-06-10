import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  authSessionSetCookieHeader,
} from "../../../shared/auth/session-cookie";

type ApiEvent = {
  body?: string | null;
};

type ApiResponse = {
  body: string;
  cookies?: string[];
  headers?: Record<string, string>;
  statusCode: number;
};

export async function postHandler(event: ApiEvent): Promise<ApiResponse> {
  const parsed = parseJsonBody(event.body);
  const token = typeof parsed.accessToken === "string" ? parsed.accessToken : "";
  if (!token) {
    return json(401, { error: "missing_token" });
  }

  try {
    const claims = await verifier().verify(token);
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    const exp = typeof claims.exp === "number" ? claims.exp : 0;
    if (!sub || exp <= Math.floor(Date.now() / 1000)) {
      return json(401, { error: "invalid_token" });
    }

    const expiresAt = new Date(exp * 1000).toISOString();
    return {
      ...json(200, {
        authenticated: true,
        expiresAt,
        user: { cognitoSub: sub },
      }),
      cookies: [
        authSessionSetCookieHeader({
          maxAge: exp - Math.floor(Date.now() / 1000),
          value: token,
        }),
      ],
    };
  } catch {
    return json(401, { error: "invalid_token" });
  }
}

export async function deleteHandler(): Promise<ApiResponse> {
  return {
    ...json(200, { status: "session_cleared" }),
    cookies: [
      authSessionSetCookieHeader({
        maxAge: 0,
        value: "",
      }),
    ],
  };
}

function verifier() {
  return CognitoJwtVerifier.create({
    clientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    tokenUse: "access",
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
  });
}

function parseJsonBody(body: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = body ? JSON.parse(body) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function json(statusCode: number, body: Record<string, unknown>): ApiResponse {
  return {
    body: JSON.stringify(body),
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    statusCode,
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
