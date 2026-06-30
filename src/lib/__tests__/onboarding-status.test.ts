import { describe, expect, it } from "vitest";
import {
  consentEvidenceKey,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  legacyConsentEvidenceKey,
  linkMdiPatientCase,
  linkStripeCustomer,
  recordCurrentConsentAcceptance,
  recordConsentEvidence,
  type AppDataRecord,
} from "@/lib/dynamodb/app-data";
import {
  currentRequiredConsents,
  requiredConsentsForPrecheck,
} from "@/lib/consents";
import { readOnboardingGateSnapshot } from "../onboarding-status";

const now = "2026-06-09T15:00:00.000Z";
const cognitoSub = "cognito-sub-001";

describe("onboarding status snapshot reads", () => {
  it("reads only minimal status and linkage records for route gating", () => {
    const repository = createInMemoryAppDataRepository();

    repository.put(createPatientProfileRecord({
      cognitoSub,
      onboardingStatus: "billing_ready",
      now,
    }));
    recordCurrentConsentAcceptance(repository, {
      cognitoSub,
      acceptedAt: now,
      now,
    });
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId: "mdi_patient_001",
      mdiCaseId: "mdi_case_001",
      now,
    });
    linkStripeCustomer(repository, {
      cognitoSub,
      stripeCustomerId: "cus_opaque_001",
      stripeSubscriptionId: "sub_opaque_001",
      billingStatus: "payment_method_collected",
      now,
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toEqual({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        consentAccepted: true,
        mdiCaseId: "mdi_case_001",
        mdiPatientId: "mdi_patient_001",
        onboardingStatus: "billing_ready",
      },
    });
  });

  it("includes residency state as the intake precheck completion marker", () => {
    const repository = createInMemoryAppDataRepository();

    repository.put(createPatientProfileRecord({
      cognitoSub,
      onboardingStatus: "intake_ready",
      now,
      residencyState: "IL",
    }));
    recordCurrentConsentAcceptance(repository, {
      cognitoSub,
      acceptedAt: now,
      now,
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toEqual({
      ok: true,
      value: {
        consentAccepted: true,
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });
  });

  it("treats missing records as incomplete status without creating data", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toEqual({
      ok: true,
      value: {
        consentAccepted: false,
      },
    });
  });

  it("fails closed when a gate key contains the wrong record type", () => {
    const wrongRecord: AppDataRecord = {
      ...consentEvidenceKey(
        cognitoSub,
        currentRequiredConsents[0].consentKind,
        currentRequiredConsents[0].version,
      ),
      recordType: "patientProfile",
      schemaVersion: 1,
      cognitoSub,
      onboardingStatus: "intake_ready",
      createdAt: now,
      updatedAt: now,
    };
    const repository = createInMemoryAppDataRepository([wrongRecord], {
      validateSeed: false,
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "validation_failed",
      },
    });
  });

  it("treats partial current consent acceptance as incomplete", () => {
    const repository = createInMemoryAppDataRepository();
    recordConsentEvidence(repository, {
      acceptedAt: now,
      cognitoSub,
      consentKind: currentRequiredConsents[0].consentKind,
      now,
      version: currentRequiredConsents[0].version,
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toEqual({
      ok: true,
      value: {
        consentAccepted: false,
      },
    });
  });

  it("can evaluate a staged consent set without relaxing current onboarding", () => {
    const repository = createInMemoryAppDataRepository();
    const privacyNotice = currentRequiredConsents.find((consent) =>
      consent.consentKind === "privacy_notice"
    );
    expect(privacyNotice).toBeDefined();
    recordConsentEvidence(repository, {
      acceptedAt: now,
      cognitoSub,
      consentKind: privacyNotice!.consentKind,
      now,
      version: privacyNotice!.version,
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toEqual({
      ok: true,
      value: {
        consentAccepted: false,
      },
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
        requiredConsents: requiredConsentsForPrecheck(),
      }),
    ).toEqual({
      ok: true,
      value: {
        consentAccepted: true,
      },
    });
  });

  it("treats stale and legacy aggregate consent as incomplete", () => {
    const repository = createInMemoryAppDataRepository([
      {
        ...legacyConsentEvidenceKey(cognitoSub, "consent-v1"),
        recordType: "consentEvidence",
        schemaVersion: 1,
        cognitoSub,
        version: "consent-v1",
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      } as AppDataRecord,
    ], { validateSeed: false });
    recordConsentEvidence(repository, {
      acceptedAt: now,
      cognitoSub,
      consentKind: currentRequiredConsents[1].consentKind,
      now,
      version: "privacy-2026-05-legal-v1",
    });

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "unused-compat-version",
      }),
    ).toEqual({
      ok: true,
      value: {
        consentAccepted: false,
      },
    });
  });
});
