import { describe, expect, it } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  recordCurrentConsentAcceptance,
} from "@/lib/dynamodb/app-data";
import {
  cognitoIssuer,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import { evaluateProtectedRouteAccess } from "../protected-routes";

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

describe("protected route access helper", () => {
  it("redirects missing session tokens to sign-in for protected routes", async () => {
    await expect(
      evaluateProtectedRouteAccess({
        config,
        consentVersion: "unused-compat-version",
        now,
        pathname: "/dashboard",
        repository: createInMemoryAppDataRepository(),
        token: null,
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        decision: "redirect",
        destination: "/sign-in?returnTo=%2Fdashboard",
        reason: "authentication_required",
      },
    });
  });

  it("redirects authenticated skip-ahead attempts using DynamoDB status records", async () => {
    const repository = createInMemoryAppDataRepository();
    repository.put(createPatientProfileRecord({
      cognitoSub: "cognito-sub-0123456789abcdef",
      onboardingStatus: "intake_ready",
      now: nowIso,
    }));
    recordCurrentConsentAcceptance(repository, {
      acceptedAt: nowIso,
      cognitoSub: "cognito-sub-0123456789abcdef",
      now: nowIso,
    });

    await expect(
      evaluateProtectedRouteAccess({
        config,
        consentVersion: "unused-compat-version",
        now,
        pathname: "/dashboard",
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        decision: "redirect",
        destination: "/intake",
        reason: "onboarding_step_required",
      },
    });
  });

  it("allows precheck-complete patients to reach the MDI onboarding step", async () => {
    const repository = createInMemoryAppDataRepository();
    repository.put(createPatientProfileRecord({
      cognitoSub: "cognito-sub-0123456789abcdef",
      onboardingStatus: "intake_ready",
      now: nowIso,
      residencyState: "IL",
    }));
    recordCurrentConsentAcceptance(repository, {
      acceptedAt: nowIso,
      cognitoSub: "cognito-sub-0123456789abcdef",
      now: nowIso,
    });

    await expect(
      evaluateProtectedRouteAccess({
        config,
        consentVersion: "unused-compat-version",
        now,
        pathname: "/onboarding/mdi",
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        decision: "allow",
      },
    });
  });

  it("fails closed on DynamoDB status read errors", async () => {
    const repository = createInMemoryAppDataRepository([
      {
        pk: "PATIENT#cognito-sub-0123456789abcdef",
        sk: "PROFILE",
        recordType: "consentEvidence",
        schemaVersion: 1,
        cognitoSub: "cognito-sub-0123456789abcdef",
        consentKind: "platform_terms",
        version: "consent-v1",
        acceptedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ], { validateSeed: false });

    await expect(
      evaluateProtectedRouteAccess({
        config,
        consentVersion: "unused-compat-version",
        now,
        pathname: "/dashboard",
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "validation_failed",
      },
    });
  });

  it("redirects stale or missing current consent to the consent route", async () => {
    await expect(
      evaluateProtectedRouteAccess({
        config,
        consentVersion: "unused-compat-version",
        now,
        pathname: "/onboarding/mdi",
        repository: createInMemoryAppDataRepository(),
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        decision: "redirect",
        destination: "/onboarding/consent",
        reason: "onboarding_step_required",
      },
    });
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
