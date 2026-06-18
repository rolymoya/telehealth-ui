import { describe, expect, it } from "vitest";
import {
  cognitoIssuer,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  mdiLinkageKey,
  patientProfileKey,
  recordCurrentConsentAcceptance,
  stripeLinkageKey,
} from "@/lib/dynamodb/app-data";
import {
  ensurePatientProfile,
  resolveOnboardingStartRedirect,
  type OnboardingStartRepository,
} from "../onboarding-start";

const now = new Date("2026-06-10T18:00:00.000Z");
const nowIso = now.toISOString();
const cognitoSub = "cognito-sub-0123456789abcdef";
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

describe("onboarding start route orchestration", () => {
  it("redirects signed-out users through sign-in with a safe return path", async () => {
    await expect(
      resolveOnboardingStartRedirect({
        config,
        now,
        repository: createInMemoryAppDataRepository(),
        token: null,
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        destination: "/sign-in?returnTo=%2Fget-started",
      },
    });
  });

  it("creates a missing minimal profile and starts at consent", async () => {
    const repository = createInMemoryAppDataRepository();

    await expect(
      resolveOnboardingStartRedirect({
        config,
        now,
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        destination: "/onboarding/consent",
      },
    });

    expect(repository.get(patientProfileKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        cognitoSub,
        onboardingStatus: "profile_pending",
        recordType: "patientProfile",
      },
    });
    expect(repository.get(mdiLinkageKey(cognitoSub))).toEqual({ ok: true, value: null });
    expect(repository.get(stripeLinkageKey(cognitoSub))).toEqual({ ok: true, value: null });
  });

  it("resumes an existing consent-complete profile at intake", async () => {
    const repository = createInMemoryAppDataRepository();
    repository.put(createPatientProfileRecord({
      cognitoSub,
      onboardingStatus: "intake_ready",
      now: nowIso,
    }));
    recordCurrentConsentAcceptance(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
    });

    await expect(
      resolveOnboardingStartRedirect({
        config,
        now,
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        destination: "/intake",
      },
    });
  });

  it("rereads the profile after a concurrent first-create conflict", async () => {
    const backing = createInMemoryAppDataRepository();
    let firstProfileRead = true;
    const repository: OnboardingStartRepository = {
      get(key) {
        if (key.pk === patientProfileKey(cognitoSub).pk && key.sk === "PROFILE" && firstProfileRead) {
          firstProfileRead = false;
          return { ok: true, value: null };
        }
        return backing.get(key);
      },
      put(record) {
        if (record.recordType === "patientProfile") {
          backing.put(record);
          return {
            ok: false,
            error: {
              kind: "conditional_conflict",
              message: "Record already exists for profile",
            },
          };
        }
        return backing.put(record);
      },
    };

    await expect(
      ensurePatientProfile(repository, {
        cognitoSub,
        now: nowIso,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        cognitoSub,
        onboardingStatus: "profile_pending",
      },
    });
  });

  it("does not write clinical, MDI, Stripe, billing, or KYC fields when starting", async () => {
    const repository = createInMemoryAppDataRepository();

    await resolveOnboardingStartRedirect({
      config,
      now,
      repository,
      token: "valid-token",
      verifier: validVerifier(),
    });

    const profile = repository.get(patientProfileKey(cognitoSub));
    expect(profile.ok && profile.value).toMatchObject({
      recordType: "patientProfile",
      onboardingStatus: "profile_pending",
    });
    expect(JSON.stringify(profile)).not.toMatch(
      /answers|questionnaire|diagnosis|symptom|medication|mdiCaseId|stripeCustomerId|billing|persona|kyc/i,
    );
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
        sub: cognitoSub,
        token_use: "access",
      };
    },
  };
}
