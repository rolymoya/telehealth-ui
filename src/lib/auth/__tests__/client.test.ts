import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createBrowserCognitoAuthClient,
  type BrowserAuthSessionTransport,
  type CognitoClientTransport,
} from "@/lib/auth/client";
import {
  cognitoIssuer,
  type CognitoAuthConfig,
} from "@/lib/auth/shared";

const config: CognitoAuthConfig = {
  provider: "cognito",
  authMode: "password_auth_no_hosted_ui",
  region: "us-east-1",
  userPoolId: "us-east-1_urOM8PctH",
  userPoolClientId: "2i8kvm8c840gfou4qvlm67u2be",
  issuer: cognitoIssuer("us-east-1", "us-east-1_urOM8PctH"),
  hostedUi: {
    enabled: false,
    domain: null,
    callbackUrls: [],
    logoutUrls: [],
  },
};

describe("browser Cognito auth client", () => {
  it("confines Cognito public API calls to the client auth facade", () => {
    const clientSource = readFileSync(
      join(process.cwd(), "src/lib/auth/client.ts"),
      "utf8",
    );
    const authPanelSource = readFileSync(
      join(process.cwd(), "src/components/auth/AuthPanel.tsx"),
      "utf8",
    );

    expect(clientSource).toContain("AWSCognitoIdentityProviderService");
    expect(authPanelSource).not.toContain("AWSCognitoIdentityProviderService");
    expect(authPanelSource).not.toContain("cognito-idp.");
  });

  it("keeps sign-up, confirmation, and password reset calls inside the auth facade", async () => {
    const transport = scriptedTransport([
      {},
      {},
      {},
      {},
    ]);
    const sessionTransport = fakeSessionTransport();
    const client = createBrowserCognitoAuthClient({
      config,
      transport,
      idFactory: () => "opaque-challenge-001",
      sessionTransport,
    });

    await expect(
      client.signUp({ email: "patient@example.com", password: "Password12345" }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "verification_required", destination: "email" },
    });
    await expect(
      client.confirmEmail({ email: "patient@example.com", code: "123456" }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "email_confirmed" },
    });
    await expect(
      client.requestPasswordReset({ email: "patient@example.com" }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "password_reset_code_sent", destination: "email" },
    });
    await expect(
      client.confirmPasswordReset({
        email: "patient@example.com",
        code: "123456",
        newPassword: "NewPassword12345",
      }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "password_reset_confirmed" },
    });

    expect(transport.calls.map((call) => call.operation)).toEqual([
      "SignUp",
      "ConfirmSignUp",
      "ForgotPassword",
      "ConfirmForgotPassword",
    ]);
    expect(transport.calls[0].payload).toMatchObject({
      ClientId: config.userPoolClientId,
      Username: "patient@example.com",
      UserAttributes: [{ Name: "email", Value: "patient@example.com" }],
    });
  });

  it("completes first sign-in TOTP setup without exposing Cognito challenge sessions", async () => {
    const accessToken = fakeAccessToken();
    const transport = scriptedTransport([
      {
        ChallengeName: "MFA_SETUP",
        Session: "raw-cognito-mfa-setup-session",
      },
      {
        SecretCode: "RAW_TOTP_SECRET",
        Session: "raw-cognito-associated-session",
      },
      {
        Session: "raw-cognito-verified-session",
      },
      {
        AuthenticationResult: {
          AccessToken: accessToken,
        },
      },
      {},
    ]);
    const sessionTransport = fakeSessionTransport();
    const client = createBrowserCognitoAuthClient({
      config,
      transport,
      idFactory: () => "opaque-challenge-001",
      sessionTransport,
    });

    const setup = await client.signIn({
      email: "patient@example.com",
      password: "Password12345",
    });

    expect(setup).toEqual({
      ok: true,
      value: {
        status: "totp_setup_required",
        challengeId: "opaque-challenge-001",
        sharedSecret: "RAW_TOTP_SECRET",
      },
    });
    expect(JSON.stringify(setup)).not.toContain("patient@example.com");
    expect(JSON.stringify(setup)).not.toContain("raw-cognito");
    expect(JSON.stringify(setup)).not.toContain(accessToken);

    const signedIn = await client.completeTotpChallenge({
      challengeId: "opaque-challenge-001",
      code: "654321",
    });

    expect(signedIn).toEqual({
      ok: true,
      value: {
        status: "signed_in",
        session: {
          authenticated: true,
          user: {
            cognitoSub: "cognito-sub-0123456789abcdef",
          },
          token: {
            clientId: config.userPoolClientId,
            expiresAt: "2030-01-01T00:00:00.000Z",
            issuedAt: "2029-12-31T23:00:00.000Z",
            issuer: config.issuer,
            tokenUse: "access",
          },
        },
      },
    });
    expect(JSON.stringify(signedIn)).not.toContain("patient@example.com");
    expect(JSON.stringify(signedIn)).not.toContain("raw-cognito");
    expect(JSON.stringify(signedIn)).not.toContain(accessToken);
    expect(sessionTransport.calls).toEqual([
      { operation: "establish", accessToken },
    ]);

    await expect(client.signOut()).resolves.toEqual({
      ok: true,
      value: { status: "signed_out" },
    });
    expect(sessionTransport.calls).toEqual([
      { operation: "establish", accessToken },
      { operation: "clear" },
    ]);
    expect(transport.calls.map((call) => call.operation)).toEqual([
      "InitiateAuth",
      "AssociateSoftwareToken",
      "VerifySoftwareToken",
      "RespondToAuthChallenge",
      "GlobalSignOut",
    ]);
    expect(transport.calls[0].payload).toMatchObject({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.userPoolClientId,
      AuthParameters: {
        USERNAME: "patient@example.com",
        PASSWORD: "Password12345",
      },
    });
    expect(transport.calls[4].payload).toEqual({ AccessToken: accessToken });
  });

  it("does not report signed out when Cognito global sign-out fails", async () => {
    const accessToken = fakeAccessToken();
    const transport = scriptedTransport([
      {
        AuthenticationResult: {
          AccessToken: accessToken,
        },
      },
      Object.assign(new Error("revocation failed"), {
        name: "NotAuthorizedException",
      }),
    ]);
    const sessionTransport = fakeSessionTransport();
    const client = createBrowserCognitoAuthClient({
      config,
      transport,
      sessionTransport,
    });

    await expect(
      client.signIn({ email: "patient@example.com", password: "Password12345" }),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: "signed_in" },
    });
    await expect(client.signOut()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_credentials",
        message: "The email, password, or code was not accepted",
      },
    });
    await expect(client.getServerSession()).resolves.toMatchObject({
      ok: true,
      value: {
        user: {
          cognitoSub: "cognito-sub-0123456789abcdef",
        },
      },
    });
    expect(sessionTransport.calls).toEqual([
      { operation: "establish", accessToken },
    ]);
  });

  it("maps Cognito errors to safe messages without returning raw responses", async () => {
    const transport: CognitoClientTransport & { calls: unknown[] } = {
      calls: [],
      send: vi.fn(async () => {
        throw Object.assign(new Error("raw Cognito detail"), {
          name: "UserNotConfirmedException",
        });
      }),
    };
    const client = createBrowserCognitoAuthClient({ config, transport });

    await expect(
      client.signIn({ email: "patient@example.com", password: "Password12345" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "email_not_confirmed",
        message: "Email must be confirmed before sign-in",
      },
    });
  });

  it("maps common sign-up Cognito errors to patient-safe messages", async () => {
    const cases = [
      {
        name: "InvalidPasswordException",
        code: "invalid_password",
        message: "Use a password that meets the listed requirements.",
      },
      {
        name: "UsernameExistsException",
        code: "username_exists",
        message: "An account with this email already exists. Sign in or verify your email to continue.",
      },
      {
        name: "InvalidParameterException",
        code: "invalid_request",
        message: "Check the email, password, and code fields, then try again.",
      },
      {
        name: "LimitExceededException",
        code: "rate_limited",
        message: "Too many attempts. Wait a few minutes, then try again.",
      },
    ] as const;

    for (const testCase of cases) {
      const transport: CognitoClientTransport & { calls: unknown[] } = {
        calls: [],
        send: vi.fn(async () => {
          throw Object.assign(new Error(`raw ${testCase.name} detail with token abc123`), {
            name: testCase.name,
          });
        }),
      };
      const client = createBrowserCognitoAuthClient({ config, transport });

      await expect(
        client.signUp({ email: "patient@example.com", password: "Password12345" }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: testCase.code,
          message: testCase.message,
        },
      });
    }
  });

  it("keeps verification code Cognito errors patient-safe", async () => {
    const cases = [
      {
        name: "CodeMismatchException",
        message: "The verification code was not accepted",
      },
      {
        name: "ExpiredCodeException",
        message: "The verification code has expired",
      },
    ] as const;

    for (const testCase of cases) {
      const transport: CognitoClientTransport & { calls: unknown[] } = {
        calls: [],
        send: vi.fn(async () => {
          throw Object.assign(new Error(`raw ${testCase.name} code 123456`), {
            name: testCase.name,
          });
        }),
      };
      const client = createBrowserCognitoAuthClient({ config, transport });

      await expect(
        client.confirmEmail({ email: "patient@example.com", code: "123456" }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: "invalid_code",
          message: testCase.message,
        },
      });
    }
  });

  it("does not reveal account existence when Cognito returns UserNotFoundException", async () => {
    const transport: CognitoClientTransport & { calls: unknown[] } = {
      calls: [],
      send: vi.fn(async () => {
        throw Object.assign(new Error("raw Cognito detail"), {
          name: "UserNotFoundException",
        });
      }),
    };
    const client = createBrowserCognitoAuthClient({ config, transport });

    await expect(
      client.signIn({ email: "patient@example.com", password: "Password12345" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_credentials",
        message: "The email, password, or code was not accepted",
      },
    });
  });
});

function scriptedTransport(
  responses: Array<Record<string, unknown> | Error>,
): CognitoClientTransport & {
  calls: Array<{ operation: string; payload: Record<string, unknown> }>;
} {
  const calls: Array<{ operation: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    async send(operation, payload) {
      calls.push({ operation, payload });
      const next = responses.shift();
      if (next === undefined) {
        throw new Error("unexpected Cognito call");
      }
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
}

function fakeSessionTransport(): BrowserAuthSessionTransport & {
  calls: Array<
    | { operation: "clear" }
    | { operation: "establish"; accessToken: string }
  >;
} {
  const calls: Array<
    | { operation: "clear" }
    | { operation: "establish"; accessToken: string }
  > = [];
  return {
    calls,
    async clear() {
      calls.push({ operation: "clear" });
      return { ok: true, value: { status: "session_cleared" } };
    },
    async establish(input) {
      calls.push({ operation: "establish", accessToken: input.accessToken });
      return { ok: true, value: { status: "session_established" } };
    },
  };
}

function fakeAccessToken() {
  return [
    encodeBase64Url({ alg: "none" }),
    encodeBase64Url({
      client_id: config.userPoolClientId,
      exp: 1893456000,
      iat: 1893452400,
      iss: config.issuer,
      sub: "cognito-sub-0123456789abcdef",
      token_use: "access",
    }),
    "signature",
  ].join(".");
}

function encodeBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64url");
}
