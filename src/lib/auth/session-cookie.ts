import {
  authErr,
  authOk,
  type AuthResult,
  type CognitoAuthConfig,
  type PatientAuthSession,
} from "@/lib/auth/shared";
import {
  verifyCognitoAccessToken,
  type AuthTokenVerifier,
} from "@/lib/auth";

export const patientAccessCookieName = "__Host-apoth_access";

export type AuthSessionCookie = {
  httpOnly: true;
  maxAge: number;
  name: typeof patientAccessCookieName;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  value: string;
};

export type AuthSessionCookieResponse = {
  authenticated: true;
  expiresAt: string;
  user: PatientAuthSession["user"];
};

export async function createAuthSessionCookie(input: {
  config: CognitoAuthConfig;
  now?: Date;
  secure: boolean;
  token: string;
  verifier?: AuthTokenVerifier;
}): Promise<AuthResult<{
  cookie: AuthSessionCookie;
  response: AuthSessionCookieResponse;
}>> {
  if (!input.token) {
    return authErr("missing_token", "No Cognito access token was provided");
  }

  const session = await verifyCognitoAccessToken({
    config: input.config,
    now: input.now,
    token: input.token,
    verifier: input.verifier,
  });
  if (!session.ok) {
    return session;
  }

  const maxAge = secondsUntil(session.value.token.expiresAt, input.now ?? new Date());
  if (maxAge < 1) {
    return authErr("expired_token", "Cognito access token has expired");
  }

  return authOk({
    cookie: {
      httpOnly: true,
      maxAge,
      name: patientAccessCookieName,
      path: "/",
      sameSite: "lax",
      secure: input.secure,
      value: input.token,
    },
    response: {
      authenticated: true,
      expiresAt: session.value.token.expiresAt,
      user: session.value.user,
    },
  });
}

export function createClearedAuthSessionCookie(input: {
  secure: boolean;
}): AuthSessionCookie {
  return {
    httpOnly: true,
    maxAge: 0,
    name: patientAccessCookieName,
    path: "/",
    sameSite: "lax",
    secure: input.secure,
    value: "",
  };
}

function secondsUntil(expiresAt: string, now: Date) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}
