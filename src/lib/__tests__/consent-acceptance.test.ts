import { describe, expect, it, vi } from "vitest";
import {
  cognitoIssuer,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import {
  createInMemoryAppDataRepository,
  createConsentEvidenceRecord,
  createPatientProfileRecord,
  getRequiredConsentEvidenceStatus,
  linkMdiPatientCase,
  mdiLinkageKey,
  patientProfileKey,
  recordConsentEvidence,
  recordOnboardingTreatmentSelection,
  stripeLinkageKey,
} from "@/lib/dynamodb/app-data";
import {
  acceptCurrentConsents,
  consentAcknowledgementFieldName,
  recordConsentAcceptanceForRequiredConsentsAsync,
  resolveConsentDocumentsForDisplay,
  validateCurrentConsentAcknowledgements,
} from "../consent-acceptance";
import {
  currentRequiredConsents,
  requiredConsentsBeforeMdi,
  requiredMedicationDisclosureConsents,
  requiredConsentsForPrecheck,
} from "../consents";

const now = new Date("2026-06-10T19:00:00.000Z");
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

describe("consent acceptance", () => {
  it("rejects missing or stale acknowledgement fields before writing evidence", () => {
    expect(validateCurrentConsentAcknowledgements({})).toMatchObject({
      ok: false,
      error: {
        kind: "validation_failed",
      },
    });

    expect(validateCurrentConsentAcknowledgements({
      "consent:platform_terms:old-version": "accepted",
    })).toMatchObject({
      ok: false,
      error: {
        kind: "validation_failed",
      },
    });
  });

  it("accepts current consent and redirects to intake without MDI or Stripe side effects", async () => {
    const repository = createRepositoryWithProfile("profile_pending");

    await expect(
      acceptCurrentConsents({
        acknowledgements: currentAcknowledgements(),
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

    expect(getRequiredConsentEvidenceStatus(repository, {
      cognitoSub,
      requiredConsents: requiredConsentsBeforeMdi(),
    })).toMatchObject({
      ok: true,
      value: {
        accepted: true,
      },
    });
    expect(repository.get(mdiLinkageKey(cognitoSub))).toEqual({ ok: true, value: null });
    expect(repository.get(stripeLinkageKey(cognitoSub))).toEqual({ ok: true, value: null });
    expect(repository.get(patientProfileKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "profile_pending",
      },
    });
  });

  it("treats already-current consent as idempotent success", async () => {
    const repository = createRepositoryWithProfile("intake_ready");

    await acceptCurrentConsents({
      acknowledgements: currentAcknowledgements(),
      config,
      now,
      repository,
      token: "valid-token",
      verifier: validVerifier(),
    });

    await expect(
      acceptCurrentConsents({
        acknowledgements: currentAcknowledgements(),
        config,
        now: new Date("2026-06-10T19:05:00.000Z"),
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

  it("treats a concurrent all-current write conflict as idempotent success", async () => {
    const repository = createRepositoryWithProfile("intake_ready");
    const racingRepository = {
      ...repository,
      get: vi.fn((key: Parameters<typeof repository.get>[0]) => repository.get(key)),
      transactWrite: vi.fn(() => {
        for (const consent of currentRequiredConsents) {
          repository.put(createConsentEvidenceRecord({
            acceptedAt: nowIso,
            cognitoSub,
            consentKind: consent.consentKind,
            now: nowIso,
            version: consent.version,
          }));
        }
        return {
          ok: false as const,
          error: {
            kind: "conditional_conflict" as const,
            message: "conditional conflict",
          },
        };
      }),
    };

    await expect(
      acceptCurrentConsents({
        acknowledgements: currentAcknowledgements(),
        config,
        now,
        repository: racingRepository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        destination: "/intake",
      },
    });
    expect(racingRepository.transactWrite).toHaveBeenCalledOnce();
    expect(getRequiredConsentEvidenceStatus(repository, {
      cognitoSub,
      requiredConsents: requiredConsentsBeforeMdi(),
    })).toMatchObject({
      ok: true,
      value: {
        accepted: true,
      },
    });
  });

  it("records current consent when stale versions exist", async () => {
    const repository = createRepositoryWithProfile("profile_pending");
    recordConsentEvidence(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      consentKind: "platform_terms",
      now: nowIso,
      version: "terms-2026-05-legal-v1",
    });

    await acceptCurrentConsents({
      acknowledgements: currentAcknowledgements(),
      config,
      now,
      repository,
      token: "valid-token",
      verifier: validVerifier(),
    });

    const status = getRequiredConsentEvidenceStatus(repository, { cognitoSub });
    expect(status.ok && status.value.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consentKind: "platform_terms",
          status: "current",
        }),
      ]),
    );
  });

  it("can write a staged consent set without writing unrelated documents", async () => {
    const repository = createRepositoryWithProfile("profile_pending");
    const requiredConsents = requiredConsentsForPrecheck();

    await expect(recordConsentAcceptanceForRequiredConsentsAsync(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
      requiredConsents,
    })).resolves.toMatchObject({
      ok: true,
      value: [
        expect.objectContaining({
          consentKind: "privacy_notice",
        }),
      ],
    });

    expect(getRequiredConsentEvidenceStatus(repository, {
      cognitoSub,
      requiredConsents,
    })).toMatchObject({
      ok: true,
      value: {
        accepted: true,
      },
    });
    expect(getRequiredConsentEvidenceStatus(repository, { cognitoSub }))
      .toMatchObject({
        ok: true,
        value: {
          accepted: false,
        },
      });
  });

  it("does not write evidence for a bare authenticated post", async () => {
    const repository = createRepositoryWithProfile("profile_pending");

    await expect(
      acceptCurrentConsents({
        acknowledgements: {},
        config,
        now,
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

    expect(getRequiredConsentEvidenceStatus(repository, { cognitoSub })).toMatchObject({
      ok: true,
      value: {
        accepted: false,
      },
    });
  });

  it("does not record medication disclosure before MDI submission and case linkage", async () => {
    const repository = createRepositoryWithProfile("intake_ready");

    await expect(
      acceptCurrentConsents({
        acknowledgements: currentAcknowledgements(),
        config,
        gate: "post_questionnaire_medication",
        now,
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: { destination: "/onboarding/mdi" },
    });

    expect(getRequiredConsentEvidenceStatus(repository, {
      cognitoSub,
      requiredConsents: requiredMedicationDisclosureConsents({ treatment: "weight" }),
    })).toMatchObject({
      ok: true,
      value: { accepted: false },
    });
  });

  it("records only applicable medication disclosure after MDI submission and case linkage", async () => {
    const repository = createRepositoryWithProfile("mdi_submitted");
    await recordConsentAcceptanceForRequiredConsentsAsync(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
      requiredConsents: requiredConsentsBeforeMdi(),
    });
    expect(linkMdiPatientCase(repository, {
      cognitoSub,
      mdiCaseId: "mdi_case_consent_001",
      mdiPatientId: "mdi_patient_consent_001",
      now: nowIso,
    }).ok).toBe(true);
    expect(recordOnboardingTreatmentSelection(repository, {
      cognitoSub,
      now: nowIso,
      questionnaireId: "mdi_questionnaire_weight",
      treatment: "weight",
    }).ok).toBe(true);

    await expect(
      acceptCurrentConsents({
        acknowledgements: currentAcknowledgements(),
        config,
        gate: "post_questionnaire_medication",
        now,
        repository,
        token: "valid-token",
        verifier: validVerifier(),
      }),
    ).resolves.toEqual({
      ok: true,
      value: { destination: "/onboarding/mdi" },
    });

    expect(getRequiredConsentEvidenceStatus(repository, {
      cognitoSub,
      requiredConsents: requiredMedicationDisclosureConsents({ treatment: "weight" }),
    })).toMatchObject({
      ok: true,
      value: { accepted: true },
    });
  });

  it("resolves medication disclosure display from the stored treatment selection", async () => {
    const repository = createRepositoryWithProfile("mdi_submitted");
    await recordConsentAcceptanceForRequiredConsentsAsync(repository, {
      acceptedAt: nowIso,
      cognitoSub,
      now: nowIso,
      requiredConsents: requiredConsentsBeforeMdi(),
    });
    expect(linkMdiPatientCase(repository, {
      cognitoSub,
      mdiCaseId: "mdi_case_consent_001",
      mdiPatientId: "mdi_patient_consent_001",
      now: nowIso,
    }).ok).toBe(true);
    expect(recordOnboardingTreatmentSelection(repository, {
      cognitoSub,
      now: nowIso,
      questionnaireId: "mdi_questionnaire_weight",
      treatment: "weight",
    }).ok).toBe(true);

    await expect(resolveConsentDocumentsForDisplay({
      config,
      gate: "post_questionnaire_medication",
      now,
      repository,
      token: "valid-token",
      verifier: validVerifier(),
    })).resolves.toEqual({
      ok: true,
      value: {
        gate: "post_questionnaire_medication",
        requiredConsents: requiredMedicationDisclosureConsents({ treatment: "weight" }),
      },
    });
  });
});

function currentAcknowledgements() {
  return Object.fromEntries(
    currentRequiredConsents.map((consent) => [
      consentAcknowledgementFieldName(consent),
      "accepted",
    ]),
  );
}

function createRepositoryWithProfile(
  onboardingStatus: Parameters<typeof createPatientProfileRecord>[0]["onboardingStatus"],
) {
  const repository = createInMemoryAppDataRepository();
  repository.put(createPatientProfileRecord({
    cognitoSub,
    onboardingStatus,
    now: nowIso,
  }));
  return repository;
}

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
