import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { CognitoAccessTokenPayload } from "aws-jwt-verify/jwt-model";

export const cognitoAuthEnv = {
  region: "NEXT_PUBLIC_COGNITO_REGION",
  userPoolId: "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
  userPoolClientId: "NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID",
} as const;

export type AuthEnvironment = Record<string, string | undefined>;

export type CognitoAuthConfig = {
  provider: "cognito";
  authMode: "srp_no_hosted_ui";
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  issuer: string;
  hostedUi: {
    enabled: false;
    domain: null;
    callbackUrls: [];
    logoutUrls: [];
  };
};

export type AuthErrorCode =
  | "email_not_confirmed"
  | "expired_token"
  | "invalid_client"
  | "invalid_config"
  | "invalid_credentials"
  | "invalid_mfa_code"
  | "invalid_token"
  | "missing_mfa_setup"
  | "missing_subject"
  | "missing_token"
  | "session_not_found"
  | "totp_required"
  | "user_not_found"
  | "wrong_issuer"
  | "wrong_token_use";

export type AuthError = {
  code: AuthErrorCode;
  message: string;
};

export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuthError };

export type CurrentPatientUser = {
  cognitoSub: string;
};

export type PatientAuthSession = {
  authenticated: true;
  user: CurrentPatientUser;
  token: {
    clientId: string;
    expiresAt: string;
    issuedAt?: string;
    issuer: string;
    tokenUse: "access";
  };
};

export type VerifiedCognitoAccessToken = Pick<
  CognitoAccessTokenPayload,
  "client_id" | "exp" | "iat" | "iss" | "sub" | "token_use"
>;

export type AuthTokenVerifier = {
  verify(token: string): Promise<VerifiedCognitoAccessToken>;
};

export type AuthTokenSource = () => string | null | undefined | Promise<string | null | undefined>;

export type AuthSignUpInput = {
  email: string;
  password: string;
};

export type AuthEmailConfirmationInput = {
  email: string;
  code: string;
};

export type AuthSignInInput = {
  email: string;
  password: string;
};

export type AuthMfaChallengeInput = {
  challengeId: string;
  code: string;
};

export type AuthSignUpState = {
  status: "verification_required";
  destination: "email";
};

export type AuthEmailConfirmationState = {
  status: "email_confirmed";
};

export type AuthSignInState =
  | { status: "totp_setup_required"; setupId: string; sharedSecret: string }
  | { status: "totp_challenge_required"; challengeId: string }
  | { status: "signed_in"; session: PatientAuthSession };

export type AuthSignOutState = {
  status: "signed_out";
};

export type PatientAuthAdapter = {
  signUp(input: AuthSignUpInput): Promise<AuthResult<AuthSignUpState>>;
  confirmEmail(input: AuthEmailConfirmationInput): Promise<AuthResult<AuthEmailConfirmationState>>;
  signIn(input: AuthSignInInput): Promise<AuthResult<AuthSignInState>>;
  completeTotpChallenge(input: AuthMfaChallengeInput): Promise<AuthResult<AuthSignInState>>;
  signOut(session: PatientAuthSession): Promise<AuthResult<AuthSignOutState>>;
  getServerSession(input?: {
    token?: string | null;
    tokenSource?: AuthTokenSource;
  }): Promise<AuthResult<PatientAuthSession>>;
};

export function resolveCognitoAuthConfig(
  env: AuthEnvironment,
): AuthResult<CognitoAuthConfig> {
  const region = normalizeEnvValue(env[cognitoAuthEnv.region]);
  const userPoolId = normalizeEnvValue(env[cognitoAuthEnv.userPoolId]);
  const userPoolClientId = normalizeEnvValue(env[cognitoAuthEnv.userPoolClientId]);

  if (!region || !isAwsRegion(region)) {
    return authErr(
      "invalid_config",
      `${cognitoAuthEnv.region} must be an AWS region such as us-east-1`,
    );
  }
  if (!userPoolId || !isCognitoUserPoolId(userPoolId, region)) {
    return authErr(
      "invalid_config",
      `${cognitoAuthEnv.userPoolId} must be a Cognito user pool ID for ${region}`,
    );
  }
  if (!userPoolClientId || !isCognitoUserPoolClientId(userPoolClientId)) {
    return authErr(
      "invalid_config",
      `${cognitoAuthEnv.userPoolClientId} must be a Cognito app client ID`,
    );
  }

  return authOk({
    provider: "cognito",
    authMode: "srp_no_hosted_ui",
    region,
    userPoolId,
    userPoolClientId,
    issuer: cognitoIssuer(region, userPoolId),
    hostedUi: {
      enabled: false,
      domain: null,
      callbackUrls: [],
      logoutUrls: [],
    },
  });
}

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

export function cognitoIssuer(region: string, userPoolId: string) {
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

function normalizeEnvValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isAwsRegion(value: string) {
  return /^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(value);
}

function isCognitoUserPoolId(value: string, region: string) {
  return value.startsWith(`${region}_`) &&
    /^[a-z]{2}(?:-gov)?-[a-z]+-\d+_[A-Za-z0-9]+$/.test(value);
}

function isCognitoUserPoolClientId(value: string) {
  return /^[A-Za-z0-9]{16,128}$/.test(value);
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

function authOk<T>(value: T): AuthResult<T> {
  return { ok: true, value };
}

function authErr(code: AuthErrorCode, message: string): AuthResult<never> {
  return { ok: false, error: { code, message } };
}

const defaultProtectedPrefixes = [
  "/account",
  "/billing",
  "/dashboard",
  "/intake",
  "/onboarding",
];
