import { describe, expect, it } from "vitest";
import {
  cognitoIssuer,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import {
  requiredConsentsBeforeBillingOrPrescribing,
  requiredConsentsBeforeMdi,
} from "@/lib/consents";
import {
  anonymousPrecheckConsumptionKey,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  linkMdiPatientCase,
  mdiLinkageKey,
  patientProfileKey,
  recordCurrentConsentAcceptance,
  recordOnboardingTreatmentSelection,
  stripeLinkageKey,
} from "@/lib/dynamodb/app-data";
import {
  bindAnonymousPrecheckContext,
  ensurePatientProfile,
  resolveOnboardingStartRedirect,
  type OnboardingStartRepository,
} from "../onboarding-start";
import {
  anonymousPrecheckNonceHash,
  createAnonymousPrecheckContext,
  verifyAnonymousPrecheckContext,
  type AppSigningSecret,
} from "../../../shared/intake/anonymous-precheck-context";

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
      update(record, options) {
        return backing.update(record, options);
      },
      transactWrite(operations) {
        return backing.transactWrite(operations);
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

  it("binds a valid anonymous precheck context to the authenticated profile", async () => {
    const repository = createInMemoryAppDataRepository();
    const context = anonymousContext({ residencyState: "IL" });

    await expect(
      resolveOnboardingStartRedirect({
        anonymousPrecheckContext: context,
        config,
        now,
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        clearAnonymousPrecheckContext: true,
        destination: "/onboarding/consent",
      },
    });

    expect(repository.get(patientProfileKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });
    expect(repository.get(anonymousPrecheckConsumptionKey(
      anonymousPrecheckNonceHash(context),
    ))).toMatchObject({
      ok: true,
      value: {
        cognitoSub,
        nonceHash: anonymousPrecheckNonceHash(context),
        recordType: "anonymousPrecheckConsumption",
      },
    });
    expect(JSON.stringify(repository.get(patientProfileKey(cognitoSub))))
      .not.toMatch(/weight|answer|questionnaire|emergency|contraindication|medication/i);
  });

  it("does not require medication disclosure before routing an anonymous bind to MDI", async () => {
    const repository = createInMemoryAppDataRepository();
    recordCurrentConsentAcceptance(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
      requiredConsents: requiredConsentsBeforeMdi(),
    });

    await expect(
      resolveOnboardingStartRedirect({
        anonymousPrecheckContext: anonymousContext({ residencyState: "IL" }),
        config,
        now,
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        clearAnonymousPrecheckContext: true,
        destination: "/onboarding/mdi",
      },
    });
  });

  it("routes a billing-ready profile to medication disclosure before billing", async () => {
    const repository = createInMemoryAppDataRepository();
    repository.put(createPatientProfileRecord({
      cognitoSub,
      onboardingStatus: "billing_ready",
      now: nowIso,
      residencyState: "IL",
    }));
    expect(linkMdiPatientCase(repository, {
      cognitoSub,
      mdiCaseId: "mdi_case_001",
      mdiPatientId: "mdi_patient_001",
      now: nowIso,
    })).toMatchObject({ ok: true });
    recordCurrentConsentAcceptance(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
      requiredConsents: requiredConsentsBeforeMdi(),
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
        destination: "/onboarding/consent?gate=medication",
      },
    });
  });

  it("routes a billing-ready profile to billing after applicable disclosure", async () => {
    const repository = createInMemoryAppDataRepository();
    repository.put(createPatientProfileRecord({
      cognitoSub,
      onboardingStatus: "billing_ready",
      now: nowIso,
      residencyState: "IL",
    }));
    expect(linkMdiPatientCase(repository, {
      cognitoSub,
      mdiCaseId: "mdi_case_001",
      mdiPatientId: "mdi_patient_001",
      now: nowIso,
    })).toMatchObject({ ok: true });
    expect(recordOnboardingTreatmentSelection(repository, {
      cognitoSub,
      now: nowIso,
      questionnaireId: "mdi_questionnaire_weight",
      treatment: "weight",
    }).ok).toBe(true);
    recordCurrentConsentAcceptance(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
      requiredConsents: requiredConsentsBeforeBillingOrPrescribing({ treatment: "weight" }),
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
        destination: "/billing",
      },
    });
  });

  it("treats same-account anonymous context replay as idempotent after bind", async () => {
    const repository = createInMemoryAppDataRepository();
    const context = anonymousContext({ residencyState: "IL" });

    await bindAnonymousPrecheckContext(repository, {
      cognitoSub,
      context,
      now: nowIso,
    });

    await expect(bindAnonymousPrecheckContext(repository, {
      cognitoSub,
      context,
      now: nowIso,
    })).resolves.toEqual({ ok: true, value: {} });
  });

  it("rejects cross-account anonymous context replay without rewriting the profile", async () => {
    const repository = createInMemoryAppDataRepository();
    const context = anonymousContext({ residencyState: "IL" });
    await bindAnonymousPrecheckContext(repository, {
      cognitoSub: "cognito-sub-otheraccount",
      context,
      now: nowIso,
    });

    await expect(bindAnonymousPrecheckContext(repository, {
      cognitoSub,
      context,
      now: nowIso,
    })).resolves.toEqual({
      ok: true,
      value: { recoverAtIntake: true },
    });
    expect(repository.get(patientProfileKey(cognitoSub))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("uses a rotation-stable consumption key for previous-secret verification", () => {
    const issued = createAnonymousPrecheckContext({
      nonce: "stable-rotation-nonce",
      now,
      residencyState: "IL",
      secret: { signingSecret: "previous-secret" },
      selectedTreatment: "weight",
    });
    const rotatingSecret: AppSigningSecret = {
      signingSecret: "current-secret",
      signingSecretPrevious: "previous-secret",
      signingSecretPreviousExpiresAt: "2026-06-10T18:10:00.000Z",
    };

    const verified = verifyAnonymousPrecheckContext({
      now,
      secret: rotatingSecret,
      value: issued,
    });

    expect(verified.ok && anonymousPrecheckNonceHash(verified.payload)).toBe(
      anonymousPrecheckNonceHash(anonymousContext({
        nonce: "stable-rotation-nonce",
        residencyState: "IL",
      })),
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

function anonymousContext(input: {
  nonce?: string;
  residencyState: "IL" | "CA";
}) {
  const secret: AppSigningSecret = { signingSecret: "anonymous-bind-secret" };
  const value = createAnonymousPrecheckContext({
    nonce: input.nonce ?? "anonymous-bind-nonce",
    now,
    residencyState: input.residencyState,
    secret,
    selectedTreatment: "weight",
  });
  const verified = verifyAnonymousPrecheckContext({ now, secret, value });
  if (!verified.ok) {
    throw new Error("Expected anonymous context to verify");
  }
  return verified.payload;
}
