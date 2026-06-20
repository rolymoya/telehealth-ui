export const cognitoAuthEnv = {
  region: "NEXT_PUBLIC_COGNITO_REGION",
  userPoolId: "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
  userPoolClientId: "NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID",
} as const;

export type AuthEnvironment = Record<string, string | undefined>;

export type CognitoAuthConfig = {
  provider: "cognito";
  authMode: "password_auth_no_hosted_ui";
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
  | "invalid_code"
  | "invalid_config"
  | "invalid_credentials"
  | "invalid_mfa_code"
  | "invalid_password"
  | "invalid_request"
  | "invalid_token"
  | "missing_mfa_setup"
  | "missing_subject"
  | "missing_token"
  | "password_reset_required"
  | "rate_limited"
  | "session_not_found"
  | "totp_required"
  | "unsupported_challenge"
  | "username_exists"
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

export type AuthPasswordResetRequestInput = {
  email: string;
};

export type AuthPasswordResetConfirmInput = {
  email: string;
  code: string;
  newPassword: string;
};

export type AuthSignUpState = {
  status: "verification_required";
  destination: "email";
};

export type AuthEmailConfirmationState = {
  status: "email_confirmed";
};

export type AuthPasswordResetRequestState = {
  status: "password_reset_code_sent";
  destination: "email";
};

export type AuthPasswordResetConfirmState = {
  status: "password_reset_confirmed";
};

export type AuthSignInState =
  | { status: "totp_setup_required"; challengeId: string; sharedSecret: string }
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
  requestPasswordReset(input: AuthPasswordResetRequestInput): Promise<AuthResult<AuthPasswordResetRequestState>>;
  confirmPasswordReset(input: AuthPasswordResetConfirmInput): Promise<AuthResult<AuthPasswordResetConfirmState>>;
  signOut(session?: PatientAuthSession | null): Promise<AuthResult<AuthSignOutState>>;
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
    authMode: "password_auth_no_hosted_ui",
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

export function cognitoIssuer(region: string, userPoolId: string) {
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

export function authOk<T>(value: T): AuthResult<T> {
  return { ok: true, value };
}

export function authErr(code: AuthErrorCode, message: string): AuthResult<never> {
  return { ok: false, error: { code, message } };
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
