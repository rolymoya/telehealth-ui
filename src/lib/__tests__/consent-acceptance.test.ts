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
  mdiLinkageKey,
  patientProfileKey,
  recordConsentEvidence,
  stripeLinkageKey,
} from "@/lib/dynamodb/app-data";
import {
  acceptCurrentConsents,
  consentAcknowledgementFieldName,
  validateCurrentConsentAcknowledgements,
} from "../consent-acceptance";
import { currentRequiredConsents } from "../consents";

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

    expect(getRequiredConsentEvidenceStatus(repository, { cognitoSub })).toMatchObject({
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
    expect(getRequiredConsentEvidenceStatus(repository, { cognitoSub })).toMatchObject({
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
