import { describe, expect, it, vi } from "vitest";
import {
  cognitoAuthEnv,
  cognitoIssuer,
  getCurrentUser,
  getServerSession,
  isProtectedRoute,
  requirePatientSession,
  resolveCognitoAuthConfig,
  sessionFromVerifiedClaims,
  type AuthMfaChallengeInput,
  type AuthErrorCode,
  type AuthResult,
  type AuthSignInState,
  type AuthSignOutState,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
  type PatientAuthAdapter,
  type PatientAuthSession,
  type VerifiedCognitoAccessToken,
} from "@/lib/auth";

const now = new Date("2026-06-08T18:00:00.000Z");
const future = Math.floor(now.getTime() / 1000) + 3600;
const issuedAt = Math.floor(now.getTime() / 1000) - 60;

const authEnv = {
  [cognitoAuthEnv.region]: "us-east-1",
  [cognitoAuthEnv.userPoolId]: "us-east-1_urOM8PctH",
  [cognitoAuthEnv.userPoolClientId]: "2i8kvm8c840gfou4qvlm67u2be",
};

function authConfig(): CognitoAuthConfig {
  const result = resolveCognitoAuthConfig(authEnv);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function verifiedClaims(
  overrides: Partial<VerifiedCognitoAccessToken> = {},
): VerifiedCognitoAccessToken {
  const config = authConfig();
  return {
    client_id: config.userPoolClientId,
    exp: future,
    iat: issuedAt,
    iss: config.issuer,
    sub: "cognito-sub-0123456789abcdef",
    token_use: "access",
    ...overrides,
  };
}

function verifierReturning(
  claims: VerifiedCognitoAccessToken,
): AuthTokenVerifier {
  return {
    verify: vi.fn(async () => claims),
  };
}

describe("Cognito auth config", () => {
  it("parses public Cognito identifiers and fixes the launch no-hosted-UI posture", () => {
    expect(resolveCognitoAuthConfig(authEnv)).toEqual({
      ok: true,
      value: {
        provider: "cognito",
        authMode: "srp_no_hosted_ui",
        region: "us-east-1",
        userPoolId: "us-east-1_urOM8PctH",
        userPoolClientId: "2i8kvm8c840gfou4qvlm67u2be",
        issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_urOM8PctH",
        hostedUi: {
          enabled: false,
          domain: null,
          callbackUrls: [],
          logoutUrls: [],
        },
      },
    });
  });

  it("rejects missing or cross-region Cognito identifiers", () => {
    expect(resolveCognitoAuthConfig({}).ok).toBe(false);

    expect(
      resolveCognitoAuthConfig({
        ...authEnv,
        [cognitoAuthEnv.userPoolId]: "us-west-2_urOM8PctH",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_config",
        message: "NEXT_PUBLIC_COGNITO_USER_POOL_ID must be a Cognito user pool ID for us-east-1",
      },
    });
  });
});

describe("Cognito server session facade", () => {
  it("returns missing_token before verifier work", async () => {
    const verifier = verifierReturning(verifiedClaims());

    await expect(
      getServerSession({
        config: authConfig(),
        verifier,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "missing_token",
        message: "No Cognito access token was provided",
      },
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("normalizes verified Cognito access token claims into a PHI-minimized session", async () => {
    await expect(
      getServerSession({
        config: authConfig(),
        token: "verified.jwt",
        verifier: verifierReturning(
          verifiedClaims(),
        ),
        now,
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        authenticated: true,
        user: {
          cognitoSub: "cognito-sub-0123456789abcdef",
        },
        token: {
          clientId: "2i8kvm8c840gfou4qvlm67u2be",
          expiresAt: "2026-06-08T19:00:00.000Z",
          issuedAt: "2026-06-08T17:59:00.000Z",
          issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_urOM8PctH",
          tokenUse: "access",
        },
      },
    });
  });

  it("fails closed for invalid verifier results and wrong token claims", async () => {
    await expect(
      getServerSession({
        config: authConfig(),
        token: "bad.jwt",
        verifier: { verify: vi.fn(async () => { throw new Error("raw verifier detail"); }) },
        now,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_token",
        message: "Cognito access token could not be verified",
      },
    });

    expect(
      sessionFromVerifiedClaims({
        config: authConfig(),
        claims: verifiedClaims({ iss: cognitoIssuer("us-west-2", "us-west-2_example") }),
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "wrong_issuer",
        message: "Cognito access token issuer does not match this stage",
      },
    });

    expect(
      sessionFromVerifiedClaims({
        config: authConfig(),
        claims: verifiedClaims({ client_id: "wrongclientid1234" }),
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_client",
        message: "Cognito access token client does not match this app",
      },
    });

    expect(
      sessionFromVerifiedClaims({
        config: authConfig(),
        claims: verifiedClaims({ token_use: "id" as "access" }),
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "wrong_token_use",
        message: "Expected a Cognito access token",
      },
    });

    expect(
      sessionFromVerifiedClaims({
        config: authConfig(),
        claims: verifiedClaims({ exp: Math.floor(now.getTime() / 1000) }),
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "expired_token",
        message: "Cognito access token has expired",
      },
    });
  });

  it("exposes current-user and protected-route helpers through the facade", async () => {
    const sessionInput = {
      config: authConfig(),
      token: "verified.jwt",
      verifier: verifierReturning(verifiedClaims()),
      now,
    };

    await expect(getCurrentUser(sessionInput)).resolves.toEqual({
      ok: true,
      value: {
        cognitoSub: "cognito-sub-0123456789abcdef",
      },
    });
    await expect(requirePatientSession(sessionInput)).resolves.toMatchObject({
      authenticated: true,
      user: {
        cognitoSub: "cognito-sub-0123456789abcdef",
      },
    });

    expect(isProtectedRoute("/dashboard/cases")).toBe(true);
    expect(isProtectedRoute("/billing?tab=history")).toBe(true);
    expect(isProtectedRoute("/privacy")).toBe(false);
  });
});

describe("auth adapter lifecycle contract", () => {
  it("supports sign-up, email verification, MFA sign-in, server lookup, and sign-out through the facade", async () => {
    const adapter = new InMemoryPatientAuthAdapter(authConfig());

    await expect(
      adapter.signUp({ email: "patient@example.com", password: "Password12345" }),
    ).resolves.toEqual({
      ok: true,
      value: {
        status: "verification_required",
        destination: "email",
      },
    });

    await expect(
      adapter.signIn({ email: "patient@example.com", password: "Password12345" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "email_not_confirmed",
        message: "Email must be confirmed before sign-in",
      },
    });

    await expect(
      adapter.confirmEmail({ email: "patient@example.com", code: "123456" }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "email_confirmed" },
    });

    const setup = await adapter.signIn({
      email: "patient@example.com",
      password: "Password12345",
    });
    expect(setup).toEqual({
      ok: true,
      value: {
        status: "totp_setup_required",
        setupId: "setup:patient@example.com",
        sharedSecret: "fake_totp_secret",
      },
    });

    const signedIn = await adapter.completeTotpChallenge({
      challengeId: "setup:patient@example.com",
      code: "654321",
    });
    expect(signedIn).toMatchObject({
      ok: true,
      value: {
        status: "signed_in",
        session: {
          authenticated: true,
          user: {
            cognitoSub: "cognito-sub-patient",
          },
        },
      },
    });
    if (!signedIn.ok || signedIn.value.status !== "signed_in") {
      throw new Error("expected signed-in state");
    }

    await expect(
      adapter.getServerSession({ token: "session:patient@example.com" }),
    ).resolves.toEqual({
      ok: true,
      value: signedIn.value.session,
    });

    await expect(adapter.signOut(signedIn.value.session)).resolves.toEqual({
      ok: true,
      value: { status: "signed_out" },
    });
    await expect(
      adapter.getServerSession({ token: "session:patient@example.com" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "session_not_found",
        message: "Session has been signed out or does not exist",
      },
    });
  });
});

type InMemoryUser = {
  cognitoSub: string;
  confirmed: boolean;
  email: string;
  password: string;
  totpEnrolled: boolean;
};

class InMemoryPatientAuthAdapter implements PatientAuthAdapter {
  private readonly sessions = new Map<string, PatientAuthSession>();
  private readonly users = new Map<string, InMemoryUser>();

  constructor(private readonly config: CognitoAuthConfig) {}

  async signUp(input: { email: string; password: string }) {
    this.users.set(input.email, {
      cognitoSub: "cognito-sub-patient",
      confirmed: false,
      email: input.email,
      password: input.password,
      totpEnrolled: false,
    });
    return ok({ status: "verification_required", destination: "email" } as const);
  }

  async confirmEmail(input: { email: string; code: string }) {
    const user = this.users.get(input.email);
    if (!user || input.code !== "123456") {
      return err("user_not_found", "User confirmation failed");
    }
    user.confirmed = true;
    return ok({ status: "email_confirmed" } as const);
  }

  async signIn(input: { email: string; password: string }): Promise<AuthResult<AuthSignInState>> {
    const user = this.users.get(input.email);
    if (!user || user.password !== input.password) {
      return err("invalid_credentials", "Email or password is incorrect");
    }
    if (!user.confirmed) {
      return err("email_not_confirmed", "Email must be confirmed before sign-in");
    }
    if (!user.totpEnrolled) {
      return ok({
        status: "totp_setup_required",
        setupId: `setup:${input.email}`,
        sharedSecret: "fake_totp_secret",
      });
    }
    return ok({
      status: "totp_challenge_required",
      challengeId: `challenge:${input.email}`,
    });
  }

  async completeTotpChallenge(
    input: AuthMfaChallengeInput,
  ): Promise<AuthResult<AuthSignInState>> {
    if (input.code !== "654321") {
      return err("invalid_mfa_code", "MFA code is incorrect");
    }

    const [kind, email] = input.challengeId.split(":");
    const user = this.users.get(email);
    if (!user || (kind !== "setup" && kind !== "challenge")) {
      return err("totp_required", "A valid TOTP challenge is required");
    }

    user.totpEnrolled = true;
    const session = sessionFromVerifiedClaims({
      config: this.config,
      claims: verifiedClaims({
        sub: user.cognitoSub,
      }),
      now,
    });
    if (!session.ok) {
      return session;
    }

    this.sessions.set(`session:${user.email}`, session.value);
    return ok({ status: "signed_in", session: session.value });
  }

  async signOut(session: PatientAuthSession): Promise<AuthResult<AuthSignOutState>> {
    for (const [token, value] of this.sessions.entries()) {
      if (value.user.cognitoSub === session.user.cognitoSub) {
        this.sessions.delete(token);
      }
    }
    return ok({ status: "signed_out" });
  }

  async getServerSession(input?: { token?: string | null }) {
    const session = input?.token ? this.sessions.get(input.token) : null;
    if (!session) {
      return err("session_not_found", "Session has been signed out or does not exist");
    }
    return ok(session);
  }
}

function ok<T>(value: T): AuthResult<T> {
  return { ok: true, value };
}

function err(code: AuthErrorCode, message: string): AuthResult<never> {
  return { ok: false, error: { code, message } };
}
