import { describe, expect, it } from "vitest";
import {
  consentEvidenceKey,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  linkMdiPatientCase,
  linkStripeCustomer,
  recordConsentEvidence,
  type AppDataRecord,
} from "@/lib/dynamodb/app-data";
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
    recordConsentEvidence(repository, {
      cognitoSub,
      version: "consent-v1",
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
        consentVersion: "consent-v1",
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

  it("treats missing records as incomplete status without creating data", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      readOnboardingGateSnapshot(repository, {
        cognitoSub,
        consentVersion: "consent-v1",
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
      ...consentEvidenceKey(cognitoSub, "consent-v1"),
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
        consentVersion: "consent-v1",
      }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "validation_failed",
      },
    });
  });
});
