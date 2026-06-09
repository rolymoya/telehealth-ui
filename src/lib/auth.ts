import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { CognitoAccessTokenPayload } from "aws-jwt-verify/jwt-model";
import {
  authErr,
  authOk,
  cognitoAuthEnv,
  cognitoIssuer,
  resolveCognitoAuthConfig,
  type AuthEmailConfirmationInput,
  type AuthEmailConfirmationState,
  type AuthEnvironment,
  type AuthMfaChallengeInput,
  type AuthPasswordResetConfirmInput,
  type AuthPasswordResetConfirmState,
  type AuthPasswordResetRequestInput,
  type AuthPasswordResetRequestState,
  type AuthResult,
  type AuthSignInInput,
  type AuthSignInState,
  type AuthSignOutState,
  type AuthSignUpInput,
  type AuthSignUpState,
  type AuthTokenSource,
  type CognitoAuthConfig,
  type CurrentPatientUser,
  type PatientAuthAdapter,
  type PatientAuthSession,
} from "./auth/shared";

export {
  cognitoAuthEnv,
  cognitoIssuer,
  resolveCognitoAuthConfig,
  type AuthEmailConfirmationInput,
  type AuthEmailConfirmationState,
  type AuthEnvironment,
  type AuthError,
  type AuthErrorCode,
  type AuthMfaChallengeInput,
  type AuthPasswordResetConfirmInput,
  type AuthPasswordResetConfirmState,
  type AuthPasswordResetRequestInput,
  type AuthPasswordResetRequestState,
  type AuthResult,
  type AuthSignInInput,
  type AuthSignInState,
  type AuthSignOutState,
  type AuthSignUpInput,
  type AuthSignUpState,
  type AuthTokenSource,
  type CognitoAuthConfig,
  type CurrentPatientUser,
  type PatientAuthAdapter,
  type PatientAuthSession,
} from "./auth/shared";

export type VerifiedCognitoAccessToken = Pick<
  CognitoAccessTokenPayload,
  "client_id" | "exp" | "iat" | "iss" | "sub" | "token_use"
>;

export type AuthTokenVerifier = {
  verify(token: string): Promise<VerifiedCognitoAccessToken>;
};

export function createCognitoAccessTokenVerifier(
  config: CognitoAuthConfig,
): AuthTokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: "access",
    clientId: config.userPoolClientId,
  });

  return {
    async verify(token) {
      return verifier.verify(token);
    },
  };
}

export async function verifyCognitoAccessToken(input: {
  token: string;
  config: CognitoAuthConfig;
  verifier?: AuthTokenVerifier;
  now?: Date;
}): Promise<AuthResult<PatientAuthSession>> {
  const verifier = input.verifier ?? createCognitoAccessTokenVerifier(input.config);

  let claims: VerifiedCognitoAccessToken;
  try {
    claims = await verifier.verify(input.token);
  } catch {
    return authErr("invalid_token", "Cognito access token could not be verified");
  }

  return sessionFromVerifiedClaims({
    claims,
    config: input.config,
    now: input.now,
  });
}

export async function getServerSession(input: {
  config: CognitoAuthConfig;
  token?: string | null;
  tokenSource?: AuthTokenSource;
  verifier?: AuthTokenVerifier;
  now?: Date;
}): Promise<AuthResult<PatientAuthSession>> {
  const token = input.token ?? (input.tokenSource ? await input.tokenSource() : null);
  if (!token) {
    return authErr("missing_token", "No Cognito access token was provided");
  }

  return verifyCognitoAccessToken({
    token,
    config: input.config,
    verifier: input.verifier,
    now: input.now,
  });
}

export async function getCurrentUser(input: Parameters<typeof getServerSession>[0]) {
  const session = await getServerSession(input);
  if (!session.ok) {
    return session;
  }
  return authOk(session.value.user);
}

export async function requirePatientSession(
  input: Parameters<typeof getServerSession>[0],
): Promise<PatientAuthSession> {
  const session = await getServerSession(input);
  if (!session.ok) {
    throw new Error(session.error.message);
  }
  return session.value;
}

export function isProtectedRoute(pathname: string, protectedPrefixes = defaultProtectedPrefixes) {
  const normalized = normalizePathname(pathname);
  return protectedPrefixes.some((prefix) => {
    const normalizedPrefix = normalizePathname(prefix);
    return normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`);
  });
}

export function sessionFromVerifiedClaims(input: {
  claims: VerifiedCognitoAccessToken;
  config: CognitoAuthConfig;
  now?: Date;
}): AuthResult<PatientAuthSession> {
  const { claims, config } = input;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);

  if (claims.iss !== config.issuer) {
    return authErr("wrong_issuer", "Cognito access token issuer does not match this stage");
  }
  if (claims.token_use !== "access") {
    return authErr("wrong_token_use", "Expected a Cognito access token");
  }
  if (claims.client_id !== config.userPoolClientId) {
    return authErr("invalid_client", "Cognito access token client does not match this app");
  }
  if (!isCognitoSubject(claims.sub)) {
    return authErr("missing_subject", "Cognito access token is missing a valid subject");
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
    return authErr("expired_token", "Cognito access token has expired");
  }

  return authOk({
    authenticated: true,
    user: {
      cognitoSub: claims.sub,
    },
    token: {
      clientId: claims.client_id,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      ...(Number.isFinite(claims.iat)
        ? { issuedAt: new Date(claims.iat * 1000).toISOString() }
        : {}),
      issuer: claims.iss,
      tokenUse: "access",
    },
  });
}

function isCognitoSubject(value: string | undefined) {
  if (!value) {
    return false;
  }
  return /^(?:cognito-sub-[A-Za-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
    .test(value);
}

function normalizePathname(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

const defaultProtectedPrefixes = [
  "/account",
  "/billing",
  "/dashboard",
  "/intake",
  "/onboarding",
];
