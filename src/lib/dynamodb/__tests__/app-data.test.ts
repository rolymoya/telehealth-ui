import { describe, expect, it } from "vitest";
import {
  type AppDataRepository,
  claimWebhookEvent,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  findPatientByMdiPointer,
  findPatientByStripePointer,
  linkMdiPatientCase,
  linkStripeCustomer,
  markWebhookEventStatus,
  mdiPatientReverseKey,
  patientProfileKey,
  recordConsentEvidence,
  transitionOnboardingStatus,
  upsertPatientProfile,
  validateAppDataRecord,
  webhookIdempotencyKey,
} from "../app-data";

const now = "2026-06-04T18:00:00.000Z";

describe("DynamoDB app-data helpers", () => {
  it("reads and writes minimal patient linkage records through typed helpers", () => {
    const repository: AppDataRepository = createInMemoryAppDataRepository();

    const profile = createPatientProfileRecord({
      cognitoSub: "cognito-sub-001",
      onboardingStatus: "profile_pending",
      now,
    });

    expect(repository.put(profile)).toEqual({ ok: true, value: profile });
    expect(repository.get(patientProfileKey("cognito-sub-001"))).toEqual({
      ok: true,
      value: profile,
    });
  });

  it("creates MDI and Stripe reverse links for webhook lookups without scans", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        now,
      }).ok,
    ).toBe(true);

    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-001",
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: "sub_opaque_001",
        billingStatus: "payment_method_collected",
        now,
      }).ok,
    ).toBe(true);

    expect(
      findPatientByMdiPointer(repository, {
        pointerType: "case",
        mdiCaseId: "mdi_case_001",
      }),
    ).toEqual({ ok: true, value: "cognito-sub-001" });

    expect(
      findPatientByStripePointer(repository, {
        pointerType: "subscription",
        stripeSubscriptionId: "sub_opaque_001",
      }),
    ).toEqual({ ok: true, value: "cognito-sub-001" });
  });

  it("rejects duplicate vendor pointers that would point to another patient", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-001",
        stripeCustomerId: "cus_opaque_001",
        billingStatus: "active",
        now,
      }).ok,
    ).toBe(true);

    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-002",
        stripeCustomerId: "cus_opaque_001",
        billingStatus: "active",
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "conditional_conflict",
        message: "Vendor pointer already belongs to another patient",
      },
    });
  });

  it("rejects duplicate MDI and Stripe reverse pointers across patients", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        now,
      }).ok,
    ).toBe(true);
    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-001",
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: "sub_opaque_001",
        billingStatus: "active",
        now,
      }).ok,
    ).toBe(true);

    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-002",
        mdiPatientId: "mdi_patient_001",
        now,
      }),
    ).toMatchObject({ ok: false, error: { kind: "conditional_conflict" } });
    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-002",
        mdiPatientId: "mdi_patient_002",
        mdiCaseId: "mdi_case_001",
        now,
      }),
    ).toMatchObject({ ok: false, error: { kind: "conditional_conflict" } });
    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-002",
        stripeCustomerId: "cus_opaque_002",
        stripeSubscriptionId: "sub_opaque_001",
        billingStatus: "active",
        now,
      }),
    ).toMatchObject({ ok: false, error: { kind: "conditional_conflict" } });
  });

  it("allows the same patient to relink an existing vendor pointer", () => {
    const repository = createInMemoryAppDataRepository();

    const first = linkMdiPatientCase(repository, {
      cognitoSub: "cognito-sub-001",
      mdiPatientId: "mdi_patient_001",
      now,
    });
    const second = linkMdiPatientCase(repository, {
      cognitoSub: "cognito-sub-001",
      mdiPatientId: "mdi_patient_001",
      mdiCaseId: "mdi_case_001",
      now: "2026-06-04T18:01:00.000Z",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(
      findPatientByMdiPointer(repository, {
        pointerType: "patient",
        mdiPatientId: "mdi_patient_001",
      }),
    ).toEqual({ ok: true, value: "cognito-sub-001" });
  });

  it("removes stale reverse links when vendor pointers change", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        now,
      }).ok,
    ).toBe(true);
    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-001",
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: "sub_opaque_001",
        billingStatus: "active",
        now,
      }).ok,
    ).toBe(true);

    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-001",
        mdiPatientId: "mdi_patient_002",
        now: "2026-06-04T18:02:00.000Z",
      }).ok,
    ).toBe(true);
    expect(
      linkStripeCustomer(repository, {
        cognitoSub: "cognito-sub-001",
        stripeCustomerId: "cus_opaque_002",
        billingStatus: "active",
        now: "2026-06-04T18:02:00.000Z",
      }).ok,
    ).toBe(true);

    expect(
      findPatientByMdiPointer(repository, {
        pointerType: "patient",
        mdiPatientId: "mdi_patient_001",
      }),
    ).toEqual({ ok: true, value: null });
    expect(
      findPatientByMdiPointer(repository, {
        pointerType: "case",
        mdiCaseId: "mdi_case_001",
      }),
    ).toEqual({ ok: true, value: null });
    expect(
      findPatientByStripePointer(repository, {
        pointerType: "customer",
        stripeCustomerId: "cus_opaque_001",
      }),
    ).toEqual({ ok: true, value: null });
    expect(
      findPatientByStripePointer(repository, {
        pointerType: "subscription",
        stripeSubscriptionId: "sub_opaque_001",
      }),
    ).toEqual({ ok: true, value: null });
  });

  it("returns typed webhook claim outcomes for first claims and retries", () => {
    const repository = createInMemoryAppDataRepository();

    const first = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now,
    });

    expect(first.ok && first.value.outcome).toBe("claimed");

    const duplicateProcessing = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now,
    });

    expect(duplicateProcessing.ok && duplicateProcessing.value.outcome).toBe(
      "alreadyProcessing",
    );

    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_001",
        status: "failed",
        retryable: true,
        now: "2026-06-04T18:05:00.000Z",
      }).ok,
    ).toBe(true);

    const retry = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now: "2026-06-04T18:06:00.000Z",
    });

    expect(retry.ok && retry.value.outcome).toBe("failedRetryable");
    expect(retry.ok && retry.value.record).toMatchObject({
      status: "processing",
      retryable: false,
      attempts: 2,
    });

    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_001",
        status: "processed",
        retryable: false,
        now: "2026-06-04T18:10:00.000Z",
      }).ok,
    ).toBe(true);

    const duplicate = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now,
    });

    expect(duplicate.ok && duplicate.value.outcome).toBe("alreadyProcessed");
  });

  it("maps conditional webhook claim races to duplicate claim errors", () => {
    const racingRepository: AppDataRepository = {
      get: () => ({ ok: true, value: null }),
      put: () => ({
        ok: false,
        error: {
          kind: "conditional_conflict",
          message: "Record already exists",
        },
      }),
      update: () => ({
        ok: false,
        error: {
          kind: "unexpected_client_failure",
          message: "Not expected",
        },
      }),
      delete: () => ({ ok: true, value: undefined }),
      transactWrite: () => ({ ok: true, value: undefined }),
    };

    expect(
      claimWebhookEvent(racingRepository, {
        provider: "stripe",
        eventId: "evt_opaque_001",
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "duplicate_webhook_claim",
        message: "Webhook event was claimed concurrently",
      },
    });
  });

  it("claims retryable webhook failures with a conditional update", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "mdi",
        eventId: "mdi_evt_001",
        now,
      }).ok,
    ).toBe(true);
    expect(
      markWebhookEventStatus(repository, {
        provider: "mdi",
        eventId: "mdi_evt_001",
        status: "failed",
        retryable: true,
        now: "2026-06-04T18:01:00.000Z",
      }).ok,
    ).toBe(true);

    const retry = claimWebhookEvent(repository, {
      provider: "mdi",
      eventId: "mdi_evt_001",
      now: "2026-06-04T18:02:00.000Z",
    });
    const duplicate = claimWebhookEvent(repository, {
      provider: "mdi",
      eventId: "mdi_evt_001",
      now: "2026-06-04T18:03:00.000Z",
    });

    expect(retry.ok && retry.value).toMatchObject({
      outcome: "failedRetryable",
      record: {
        status: "processing",
        retryable: false,
        attempts: 2,
      },
    });
    expect(duplicate.ok && duplicate.value.outcome).toBe("alreadyProcessing");
  });

  it("supports conditional onboarding transitions", () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub: "cognito-sub-001",
        onboardingStatus: "profile_pending",
        now,
      }),
    ]);

    expect(
      transitionOnboardingStatus(repository, {
        cognitoSub: "cognito-sub-001",
        expected: "intake_ready",
        next: "mdi_submitted",
        now,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "stale_transition",
        message: "Onboarding status did not match expected state",
      },
    });

    const transitioned = transitionOnboardingStatus(repository, {
      cognitoSub: "cognito-sub-001",
      expected: "profile_pending",
      next: "intake_ready",
      now: "2026-06-04T18:01:00.000Z",
    });

    expect(transitioned.ok && transitioned.value.onboardingStatus).toBe("intake_ready");
  });

  it("does not regress onboarding status through profile upserts", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      upsertPatientProfile(repository, {
        cognitoSub: "cognito-sub-001",
        onboardingStatus: "profile_pending",
        now,
      }).ok,
    ).toBe(true);
    expect(
      transitionOnboardingStatus(repository, {
        cognitoSub: "cognito-sub-001",
        expected: "profile_pending",
        next: "clinical_review",
        now: "2026-06-04T18:01:00.000Z",
      }).ok,
    ).toBe(true);

    const upserted = upsertPatientProfile(repository, {
      cognitoSub: "cognito-sub-001",
      onboardingStatus: "profile_pending",
      now: "2026-06-04T18:02:00.000Z",
    });

    expect(upserted.ok && upserted.value.onboardingStatus).toBe("clinical_review");
  });

  it("rejects unknown fields and concrete clinical questionnaire fields", () => {
    const repository = createInMemoryAppDataRepository();
    const profile = createPatientProfileRecord({
      cognitoSub: "cognito-sub-001",
      onboardingStatus: "profile_pending",
      now,
    });

    expect(repository.put({ ...profile, extra: "nope" } as never)).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Unknown field for patientProfile: extra",
      },
    });

    expect(repository.put({ ...profile, answers: ["clinical answer"] } as never)).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Forbidden clinical field: answers",
      },
    });

    expect(
      repository.put({
        ...profile,
        operationalContext: { diagnosis: "clinical content" },
      } as never),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Forbidden clinical field: diagnosis",
      },
    });
  });

  it("rejects malformed stored records on reads", () => {
    const malformed = {
      ...createPatientProfileRecord({
        cognitoSub: "cognito-sub-001",
        onboardingStatus: "profile_pending",
        now,
      }),
      onboardingStatus: "impossible",
    };

    expect(() => createInMemoryAppDataRepository([malformed as never])).toThrow(
      "Invalid patient profile record",
    );

    expect(validateAppDataRecord(malformed)).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid patient profile record",
      },
    });

    const repository = createInMemoryAppDataRepository([malformed as never], {
      validateSeed: false,
    });
    expect(repository.get(patientProfileKey("cognito-sub-001"))).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid patient profile record",
      },
    });
  });

  it("rejects reverse lookup records with conflicting pointer fields", () => {
    expect(
      validateAppDataRecord({
        ...mdiPatientReverseKey("mdi_patient_001"),
        recordType: "mdiReverseLookup",
        schemaVersion: 1,
        cognitoSub: "cognito-sub-001",
        pointerType: "patient",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        createdAt: now,
        updatedAt: now,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid MDI reverse lookup record",
      },
    });
  });

  it("stores consent evidence with minimized hashes only", () => {
    const repository = createInMemoryAppDataRepository();

    const evidence = recordConsentEvidence(repository, {
      cognitoSub: "cognito-sub-001",
      version: "terms-2026-06-04",
      acceptedAt: now,
      now,
      ipHash: "sha256:opaque-ip-hash",
      userAgentHash: "sha256:opaque-ua-hash",
    });

    expect(evidence.ok && evidence.value).toMatchObject({
      recordType: "consentEvidence",
      ipHash: "sha256:opaque-ip-hash",
      userAgentHash: "sha256:opaque-ua-hash",
    });

    expect(
      evidence.ok && JSON.stringify(evidence.value).includes("Mozilla"),
    ).toBe(false);

    expect(
      recordConsentEvidence(repository, {
        cognitoSub: "cognito-sub-001",
        version: "terms-raw-ip",
        acceptedAt: now,
        now,
        ipHash: "127.0.0.1",
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid consent evidence record",
      },
    });
  });

  it("rolls back failed transactions in the in-memory repository", () => {
    const repository = createInMemoryAppDataRepository();
    const profile = createPatientProfileRecord({
      cognitoSub: "cognito-sub-001",
      onboardingStatus: "profile_pending",
      now,
    });

    const transaction = repository.transactWrite([
      { type: "put", record: profile },
      {
        type: "put",
        record: {
          ...profile,
          ...mdiPatientReverseKey("mdi_patient_001"),
          recordType: "mdiReverseLookup",
          pointerType: "patient",
          mdiPatientId: "mdi_patient_001",
        } as never,
      },
    ]);

    expect(transaction.ok).toBe(false);
    expect(repository.get(patientProfileKey("cognito-sub-001"))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("does not expose questionnaire answers through Stripe linkage records", () => {
    const repository = createInMemoryAppDataRepository();

    const result = linkStripeCustomer(repository, {
      cognitoSub: "cognito-sub-001",
      stripeCustomerId: "cus_opaque_001",
      billingStatus: "payment_method_pending",
      now,
    });

    expect(result.ok && JSON.stringify(result.value)).not.toContain("condition");
    expect(result.ok && JSON.stringify(result.value)).not.toContain("diagnosis");
  });

  it("uses provider and event ID keys for webhook idempotency", () => {
    expect(webhookIdempotencyKey("mdi", "mdi_evt_001")).toEqual({
      pk: "WEBHOOK#mdi#EVENT#mdi_evt_001",
      sk: "CLAIM",
    });
  });
});
