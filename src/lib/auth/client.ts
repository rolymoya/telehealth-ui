"use client";

import {
  authErr,
  authOk,
  cognitoIssuer,
  resolveCognitoAuthConfig,
  type AuthEmailConfirmationInput,
  type AuthMfaChallengeInput,
  type AuthPasswordResetConfirmInput,
  type AuthPasswordResetRequestInput,
  type AuthResult,
  type AuthSignInInput,
  type AuthSignInState,
  type AuthSignOutState,
  type AuthSignUpInput,
  type AuthTokenSource,
  type CognitoAuthConfig,
  type PatientAuthAdapter,
  type PatientAuthSession,
} from "./shared";

export type CognitoClientTransport = {
  send(operation: CognitoOperation, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export type BrowserAuthClientOptions = {
  config: CognitoAuthConfig;
  idFactory?: () => string;
  transport?: CognitoClientTransport;
};

export function resolveBrowserCognitoConfig(env: Record<string, string | undefined>) {
  return resolveCognitoAuthConfig(env);
}

export function createBrowserCognitoAuthClient(
  options: BrowserAuthClientOptions,
): PatientAuthAdapter {
  const transport = options.transport ?? createCognitoJsonTransport(options.config);
  const idFactory = options.idFactory ?? createOpaqueChallengeId;
  const challenges = new Map<string, CognitoChallengeState>();
  let currentSession: PatientAuthSession | null = null;
  let currentAccessToken: string | null = null;

  return {
    async signUp(input: AuthSignUpInput) {
      const result = await sendCognito(transport, "SignUp", {
        ClientId: options.config.userPoolClientId,
        Username: input.email,
        Password: input.password,
        UserAttributes: [
          { Name: "email", Value: input.email },
        ],
      });
      if (!result.ok) {
        return result;
      }
      return authOk({ status: "verification_required", destination: "email" as const });
    },

    async confirmEmail(input: AuthEmailConfirmationInput) {
      const result = await sendCognito(transport, "ConfirmSignUp", {
        ClientId: options.config.userPoolClientId,
        Username: input.email,
        ConfirmationCode: input.code,
      });
      if (!result.ok) {
        return result;
      }
      return authOk({ status: "email_confirmed" as const });
    },

    async signIn(input: AuthSignInInput): Promise<AuthResult<AuthSignInState>> {
      const result = await sendCognito(transport, "InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: options.config.userPoolClientId,
        AuthParameters: {
          USERNAME: input.email,
          PASSWORD: input.password,
        },
      });
      if (!result.ok) {
        return result;
      }
      return handleAuthResponse({
        response: result.value,
        username: input.email,
        challenges,
        config: options.config,
        transport,
        idFactory,
        setSession: (session, accessToken) => {
          currentSession = session;
          currentAccessToken = accessToken;
        },
      });
    },

    async completeTotpChallenge(input: AuthMfaChallengeInput): Promise<AuthResult<AuthSignInState>> {
      const challenge = challenges.get(input.challengeId);
      if (!challenge) {
        return authErr("totp_required", "A valid MFA challenge is required");
      }

      if (challenge.kind === "mfa_setup") {
        const verified = await sendCognito(transport, "VerifySoftwareToken", {
          Session: challenge.session,
          UserCode: input.code,
        });
        if (!verified.ok) {
          return verified;
        }
        const verifiedSession = stringField(verified.value.Session);
        if (!verifiedSession) {
          return authErr("invalid_mfa_code", "MFA code could not be verified");
        }
        const response = await sendCognito(transport, "RespondToAuthChallenge", {
          ClientId: options.config.userPoolClientId,
          ChallengeName: "MFA_SETUP",
          Session: verifiedSession,
          ChallengeResponses: {
            USERNAME: challenge.username,
          },
        });
        if (!response.ok) {
          return response;
        }
        challenges.delete(input.challengeId);
        return handleAuthResponse({
          response: response.value,
          username: challenge.username,
          challenges,
          config: options.config,
          transport,
          idFactory,
          setSession: (session, accessToken) => {
            currentSession = session;
            currentAccessToken = accessToken;
          },
        });
      }

      const response = await sendCognito(transport, "RespondToAuthChallenge", {
        ClientId: options.config.userPoolClientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: challenge.session,
        ChallengeResponses: {
          USERNAME: challenge.username,
          SOFTWARE_TOKEN_MFA_CODE: input.code,
        },
      });
      if (!response.ok) {
        return response;
      }
      challenges.delete(input.challengeId);
      return handleAuthResponse({
        response: response.value,
        username: challenge.username,
        challenges,
        config: options.config,
        transport,
        idFactory,
        setSession: (session, accessToken) => {
          currentSession = session;
          currentAccessToken = accessToken;
        },
      });
    },

    async requestPasswordReset(input: AuthPasswordResetRequestInput) {
      const result = await sendCognito(transport, "ForgotPassword", {
        ClientId: options.config.userPoolClientId,
        Username: input.email,
      });
      if (!result.ok) {
        return result;
      }
      return authOk({ status: "password_reset_code_sent", destination: "email" as const });
    },

    async confirmPasswordReset(input: AuthPasswordResetConfirmInput) {
      const result = await sendCognito(transport, "ConfirmForgotPassword", {
        ClientId: options.config.userPoolClientId,
        Username: input.email,
        ConfirmationCode: input.code,
        Password: input.newPassword,
      });
      if (!result.ok) {
        return result;
      }
      return authOk({ status: "password_reset_confirmed" as const });
    },

    async signOut(): Promise<AuthResult<AuthSignOutState>> {
      if (currentAccessToken) {
        const result = await sendCognito(transport, "GlobalSignOut", {
          AccessToken: currentAccessToken,
        });
        if (!result.ok) {
          return result;
        }
      }
      currentSession = null;
      currentAccessToken = null;
      challenges.clear();
      return authOk({ status: "signed_out" });
    },

    async getServerSession(input?: {
      token?: string | null;
      tokenSource?: AuthTokenSource;
    }) {
      if (input?.token || input?.tokenSource) {
        return authErr(
          "invalid_token",
          "Browser auth client does not verify server sessions",
        );
      }
      if (!currentSession) {
        return authErr("session_not_found", "No active Cognito session is available");
      }
      return authOk(currentSession);
    },
  };
}

export function createDefaultBrowserCognitoAuthClient(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
  },
) {
  const config = resolveBrowserCognitoConfig(env);
  if (!config.ok) {
    return config;
  }
  return authOk(createBrowserCognitoAuthClient({ config: config.value }));
}

export function createCognitoJsonTransport(
  config: CognitoAuthConfig,
  fetchImpl: typeof fetch = fetch,
): CognitoClientTransport {
  return {
    async send(operation, payload) {
      const response = await fetchImpl(
        `https://cognito-idp.${config.region}.amazonaws.com/`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-amz-json-1.1",
            "x-amz-target": `AWSCognitoIdentityProviderService.${operation}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const text = await response.text();
      const parsed = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        throw new CognitoPublicError(parsed);
      }
      return isRecord(parsed) ? parsed : {};
    },
  };
}

async function sendCognito(
  transport: CognitoClientTransport,
  operation: CognitoOperation,
  payload: Record<string, unknown>,
): Promise<AuthResult<Record<string, unknown>>> {
  try {
    return authOk(await transport.send(operation, payload));
  } catch (error) {
    return authErr(...mapCognitoError(error));
  }
}

async function handleAuthResponse(input: {
  response: Record<string, unknown>;
  username: string;
  challenges: Map<string, CognitoChallengeState>;
  config: CognitoAuthConfig;
  transport: CognitoClientTransport;
  idFactory: () => string;
  setSession: (session: PatientAuthSession, accessToken: string) => void;
}): Promise<AuthResult<AuthSignInState>> {
  const authResult = recordField(input.response.AuthenticationResult);
  if (authResult) {
    const accessToken = stringField(authResult.AccessToken);
    if (!accessToken) {
      return authErr("invalid_token", "Cognito sign-in did not return an access token");
    }
    const session = clientSessionFromAccessToken(accessToken, input.config);
    if (!session.ok) {
      return session;
    }
    input.setSession(session.value, accessToken);
    return authOk({ status: "signed_in", session: session.value });
  }

  const challengeName = stringField(input.response.ChallengeName);
  const challengeSession = stringField(input.response.Session);
  if (!challengeName || !challengeSession) {
    return authErr("unsupported_challenge", "Cognito returned an unsupported sign-in state");
  }

  if (challengeName === "MFA_SETUP") {
    return beginTotpSetup({
      session: challengeSession,
      username: input.username,
      challenges: input.challenges,
      transport: input.transport,
      idFactory: input.idFactory,
    });
  }

  if (challengeName === "SOFTWARE_TOKEN_MFA") {
    const challengeId = createChallengeId(input.idFactory);
    if (!challengeId.ok) {
      return challengeId;
    }
    input.challenges.set(challengeId.value, {
      kind: "software_token_mfa",
      session: challengeSession,
      username: input.username,
    });
    return Promise.resolve(authOk({
      status: "totp_challenge_required",
      challengeId: challengeId.value,
    }));
  }

  return Promise.resolve(authErr("unsupported_challenge", "Cognito returned an unsupported sign-in challenge"));
}

async function beginTotpSetup(input: {
  session: string;
  username: string;
  challenges: Map<string, CognitoChallengeState>;
  transport: CognitoClientTransport;
  idFactory: () => string;
}): Promise<AuthResult<AuthSignInState>> {
  const associated = await sendCognito(input.transport, "AssociateSoftwareToken", {
    Session: input.session,
  });
  if (!associated.ok) {
    return associated;
  }

  const secretCode = stringField(associated.value.SecretCode);
  const session = stringField(associated.value.Session);
  if (!secretCode || !session) {
    return authErr("missing_mfa_setup", "Cognito did not return a TOTP setup secret");
  }

  const challengeId = createChallengeId(input.idFactory);
  if (!challengeId.ok) {
    return challengeId;
  }
  input.challenges.set(challengeId.value, {
    kind: "mfa_setup",
    session,
    username: input.username,
  });
  return authOk({
    status: "totp_setup_required",
    challengeId: challengeId.value,
    sharedSecret: secretCode,
  });
}

function clientSessionFromAccessToken(
  accessToken: string,
  config: CognitoAuthConfig,
): AuthResult<PatientAuthSession> {
  const claims = decodeJwtPayload(accessToken);
  if (!claims.ok) {
    return claims;
  }

  if (claims.value.iss !== config.issuer) {
    return authErr("wrong_issuer", "Cognito access token issuer does not match this stage");
  }
  if (claims.value.token_use !== "access") {
    return authErr("wrong_token_use", "Expected a Cognito access token");
  }
  if (claims.value.client_id !== config.userPoolClientId) {
    return authErr("invalid_client", "Cognito access token client does not match this app");
  }
  if (typeof claims.value.sub !== "string" || claims.value.sub.length === 0) {
    return authErr("missing_subject", "Cognito access token is missing a valid subject");
  }
  if (typeof claims.value.exp !== "number" || claims.value.exp <= Date.now() / 1000) {
    return authErr("expired_token", "Cognito access token has expired");
  }

  return authOk({
    authenticated: true,
    user: {
      cognitoSub: claims.value.sub,
    },
    token: {
      clientId: claims.value.client_id,
      expiresAt: new Date(claims.value.exp * 1000).toISOString(),
      ...(typeof claims.value.iat === "number"
        ? { issuedAt: new Date(claims.value.iat * 1000).toISOString() }
        : {}),
      issuer: claims.value.iss,
      tokenUse: "access",
    },
  });
}

function decodeJwtPayload(token: string): AuthResult<CognitoClientClaims> {
  const [, encodedPayload] = token.split(".");
  if (!encodedPayload) {
    return authErr("invalid_token", "Cognito access token is malformed");
  }

  const parsed = safeJsonParse(base64UrlDecode(encodedPayload));
  if (!isRecord(parsed)) {
    return authErr("invalid_token", "Cognito access token payload is malformed");
  }

  return authOk(parsed as CognitoClientClaims);
}

function createOpaqueChallengeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure random source unavailable");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createChallengeId(idFactory: () => string): AuthResult<string> {
  try {
    const challengeId = idFactory();
    if (challengeId.length === 0) {
      return authErr("invalid_token", "Cognito MFA challenge could not be initialized");
    }
    return authOk(challengeId);
  } catch {
    return authErr("invalid_token", "Cognito MFA challenge could not be initialized");
  }
}

function mapCognitoError(error: unknown): [code: Parameters<typeof authErr>[0], message: string] {
  const name = error instanceof CognitoPublicError
    ? error.name
    : error instanceof Error
      ? error.name
      : "";

  switch (name) {
    case "CodeMismatchException":
      return ["invalid_code", "The verification code was not accepted"];
    case "ExpiredCodeException":
      return ["invalid_code", "The verification code has expired"];
    case "NotAuthorizedException":
      return ["invalid_credentials", "The email, password, or code was not accepted"];
    case "PasswordResetRequiredException":
      return ["password_reset_required", "Password reset is required before sign-in"];
    case "UserNotConfirmedException":
      return ["email_not_confirmed", "Email must be confirmed before sign-in"];
    case "UserNotFoundException":
      return ["invalid_credentials", "The email, password, or code was not accepted"];
    default:
      return ["invalid_token", "Cognito could not complete the request"];
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function stringField(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function recordField(value: unknown) {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class CognitoPublicError extends Error {
  constructor(payload: unknown) {
    const name = isRecord(payload) && typeof payload.__type === "string"
      ? payload.__type.split("#").pop() ?? "CognitoPublicError"
      : "CognitoPublicError";
    super("Cognito public request failed");
    this.name = name;
  }
}

type CognitoOperation =
  | "ConfirmForgotPassword"
  | "ConfirmSignUp"
  | "ForgotPassword"
  | "GlobalSignOut"
  | "InitiateAuth"
  | "RespondToAuthChallenge"
  | "AssociateSoftwareToken"
  | "SignUp"
  | "VerifySoftwareToken";

type CognitoChallengeState = {
  kind: "mfa_setup" | "software_token_mfa";
  session: string;
  username: string;
};

type CognitoClientClaims = {
  client_id: string;
  exp: number;
  iat?: number;
  iss: string;
  sub: string;
  token_use: string;
};
