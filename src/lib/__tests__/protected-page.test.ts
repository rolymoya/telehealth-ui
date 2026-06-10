import { describe, expect, it, vi } from "vitest";
import {
  cognitoIssuer,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  patientProfileKey,
  recordConsentEvidence,
} from "@/lib/dynamodb/app-data";
import { allowsE2eProtectedRouteBypass } from "@/lib/e2e-auth";
import {
  createProtectedPageRepository,
  requireProtectedPageAccess,
} from "@/lib/protected-page";

const redirectMock = vi.hoisted(() => vi.fn((destination: string) => {
  throw new Error(`redirect:${destination}`);
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const now = new Date("2026-06-09T16:00:00.000Z");
const nowIso = now.toISOString();
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

describe("protected page access", () => {
  it("redirects missing cookies before rendering protected content", async () => {
    await expect(
      requireProtectedPageAccess({
        config,
        pathname: "/dashboard",
        repository: createInMemoryAppDataRepository(),
        token: null,
      }),
    ).rejects.toThrow("redirect:/sign-in?returnTo=%2Fdashboard");
  });

  it("redirects forged or expired cookies through Cognito verification", async () => {
    await expect(
      requireProtectedPageAccess({
        config,
        now,
        pathname: "/dashboard",
        repository: createInMemoryAppDataRepository(),
        token: "forged-token",
        verifier: invalidVerifier(),
      }),
    ).rejects.toThrow("redirect:/sign-in?returnTo=%2Fdashboard");
  });

  it("applies DynamoDB onboarding gates before rendering protected content", async () => {
    const repository = createInMemoryAppDataRepository();
    repository.put(createPatientProfileRecord({
      cognitoSub: "cognito-sub-0123456789abcdef",
      onboardingStatus: "intake_ready",
      now: nowIso,
    }));
    recordConsentEvidence(repository, {
      acceptedAt: nowIso,
      cognitoSub: "cognito-sub-0123456789abcdef",
      now: nowIso,
      version: "consent-v1",
    });

    await expect(
      requireProtectedPageAccess({
        config,
        consentVersion: "consent-v1",
        now,
        pathname: "/dashboard",
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).rejects.toThrow("redirect:/intake");
  });

  it("allows protected shells through the explicit non-production E2E auth seam", async () => {
    redirectMock.mockClear();

    await expect(
      requireProtectedPageAccess({
        e2eAuth: {
          env: {
            APOTH_E2E_AUTH_ENABLED: "1",
            APOTH_E2E_AUTH_TOKEN: "opaque-local-e2e-token",
            NODE_ENV: "development",
          },
          headerValue: "opaque-local-e2e-token",
        },
        pathname: "/dashboard",
        token: null,
      }),
    ).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("uses the configured DynamoDB app-data table for the live repository path", async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      expect(JSON.parse(init.body).TableName).toBe("apoth-staging-app");
      return {
        async json() {
          return { Item: null };
        },
        ok: true,
        status: 200,
      };
    });

    const repository = createProtectedPageRepository({
      APOTH_STAGE: "staging",
      AWS_ACCESS_KEY_ID: "access",
      AWS_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: "secret",
    }, {
      fetch: fetchMock,
      now: () => now,
    });

    await expect(
      repository.get(patientProfileKey("cognito-sub-0123456789abcdef")),
    ).resolves.toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("E2E protected route bypass", () => {
  it.each([
    ["disabled by default", {}, "opaque-local-e2e-token"],
    [
      "disabled in production",
      {
        APOTH_E2E_AUTH_ENABLED: "1",
        APOTH_E2E_AUTH_TOKEN: "opaque-local-e2e-token",
        NODE_ENV: "production",
      },
      "opaque-local-e2e-token",
    ],
    [
      "rejects missing token configuration",
      {
        APOTH_E2E_AUTH_ENABLED: "1",
        NODE_ENV: "development",
      },
      "opaque-local-e2e-token",
    ],
    [
      "rejects wrong header token",
      {
        APOTH_E2E_AUTH_ENABLED: "1",
        APOTH_E2E_AUTH_TOKEN: "opaque-local-e2e-token",
        NODE_ENV: "development",
      },
      "wrong-token",
    ],
  ])("%s", async (_name, env, headerValue) => {
    await expect(
      allowsE2eProtectedRouteBypass({
        env,
        headerValue,
      }),
    ).toBe(false);
  });

  it("allows only an exact matching token outside production", async () => {
    await expect(
      allowsE2eProtectedRouteBypass({
        env: {
          APOTH_E2E_AUTH_ENABLED: "1",
          APOTH_E2E_AUTH_TOKEN: "opaque-local-e2e-token",
          NODE_ENV: "development",
        },
        headerValue: "opaque-local-e2e-token",
      }),
    ).toBe(true);
  });
});

function validVerifier(): AuthTokenVerifier {
  return {
    async verify() {
      return {
        client_id: config.userPoolClientId,
        exp: Math.floor(now.getTime() / 1000) + 900,
        iat: Math.floor(now.getTime() / 1000),
        iss: config.issuer,
        sub: "cognito-sub-0123456789abcdef",
        token_use: "access",
      };
    },
  };
}

function invalidVerifier(): AuthTokenVerifier {
  return {
    async verify() {
      throw new Error("invalid token");
    },
  };
}
