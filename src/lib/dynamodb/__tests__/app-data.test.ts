import { describe, expect, it } from "vitest";
import {
  type AppDataRepository,
  claimWebhookEvent,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  createWebhookEvidenceEventId,
  evidenceEventKey,
  evidenceEventUniquenessKey,
  findPatientByMdiPointer,
  findPatientByStripePointer,
  listEvidenceEventsForMdiCase,
  listEvidenceEventsForPatient,
  linkMdiPatientCase,
  linkStripeCustomer,
  markWebhookEventStatus,
  mdiPatientReverseKey,
  patientEvidenceEventUniquenessKey,
  patientProfileKey,
  recordConsentEvidence,
  recordEvidenceEvent,
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
      processingLeaseSeconds: 60,
    });

    expect(first.ok && first.value.outcome).toBe("claimed");
    expect(first.ok && first.value.record.processingExpiresAt).toBe(
      "2026-06-04T18:01:00.000Z",
    );

    const duplicateProcessing = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now: "2026-06-04T18:00:30.000Z",
    });

    expect(duplicateProcessing.ok && duplicateProcessing.value.outcome).toBe(
      "alreadyProcessing",
    );

    const expiredLease = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now: "2026-06-04T18:01:01.000Z",
      processingLeaseSeconds: 60,
    });

    expect(expiredLease.ok && expiredLease.value).toMatchObject({
      outcome: "processingLeaseExpired",
      record: {
        status: "processing",
        retryable: false,
        attempts: 2,
        processingExpiresAt: "2026-06-04T18:02:01.000Z",
      },
    });

    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_001",
        status: "failed",
        retryable: true,
        now: "2026-06-04T18:01:30.000Z",
        expectedAttempts: 2,
        nextAttemptAfter: "2026-06-04T18:02:00.000Z",
        maxAttempts: 3,
      }).ok,
    ).toBe(true);

    const notDue = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now: "2026-06-04T18:01:45.000Z",
    });

    expect(notDue.ok && notDue.value.outcome).toBe("retryNotDue");

    const retry = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_001",
      now: "2026-06-04T18:02:00.000Z",
    });

    expect(retry.ok && retry.value.outcome).toBe("failedRetryable");
    expect(retry.ok && retry.value.record).toMatchObject({
      status: "processing",
      retryable: false,
      attempts: 3,
      maxAttempts: 3,
    });

    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_001",
        status: "processed",
        retryable: false,
        now: "2026-06-04T18:03:00.000Z",
        expectedAttempts: 3,
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
      queryByKeyPrefix: () => ({ ok: true, value: { items: [] } }),
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

  it("marks retryable webhook failures exhausted after max attempts", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_002",
        now,
        maxAttempts: 1,
      }).ok,
    ).toBe(true);
    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_002",
        status: "failed",
        retryable: true,
        now: "2026-06-04T18:01:00.000Z",
        nextAttemptAfter: "2026-06-04T18:02:00.000Z",
        maxAttempts: 1,
      }).ok,
    ).toBe(true);

    const exhausted = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_002",
      now: "2026-06-04T18:02:00.000Z",
    });

    expect(exhausted.ok && exhausted.value).toMatchObject({
      outcome: "retryExhausted",
      record: {
        status: "failed",
        retryable: false,
        attempts: 1,
        retryExhaustedAt: "2026-06-04T18:02:00.000Z",
      },
    });
  });

  it("rejects unsafe webhook event IDs at the idempotency boundary", () => {
    const repository = createInMemoryAppDataRepository();

    for (const eventId of [
      "evt_patient_email_name@test.com",
      "evt_hiv_positive_001",
      "evt_bearer_token_001",
      "evt_" + "a".repeat(140),
      "mdi_evt_case_created_001",
    ]) {
      expect(
        claimWebhookEvent(repository, {
          provider: "stripe",
          eventId,
          now,
        }),
      ).toEqual({
        ok: false,
        error: {
          kind: "validation_failed",
          message: "Invalid webhook event ID",
        },
      });
    }

    expect(
      validateAppDataRecord({
        ...webhookIdempotencyKey("mdi", "mdi_evt_diabetes_001"),
        recordType: "webhookIdempotency",
        schemaVersion: 1,
        provider: "mdi",
        eventId: "mdi_evt_diabetes_001",
        status: "processing",
        retryable: false,
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid webhook idempotency record",
      },
    });
  });

  it("rejects stale webhook status marks from expired claims", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_003",
        now,
        processingLeaseSeconds: 60,
      }).ok,
    ).toBe(true);
    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_003",
        now: "2026-06-04T18:01:01.000Z",
      }).ok,
    ).toBe(true);

    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_003",
        status: "processed",
        retryable: false,
        now: "2026-06-04T18:01:02.000Z",
        expectedAttempts: 1,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "stale_webhook_claim",
        message: "Webhook claim is no longer current",
      },
    });
  });

  it("rejects webhook status marks after the processing lease expires", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_004",
        now,
        processingLeaseSeconds: 60,
      }).ok,
    ).toBe(true);

    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_004",
        status: "processed",
        retryable: false,
        now: "2026-06-04T18:01:00.000Z",
        expectedAttempts: 1,
        expectedProcessingExpiresAt: "2026-06-04T18:01:00.000Z",
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "stale_webhook_claim",
        message: "Webhook claim is no longer current",
      },
    });
  });

  it("keeps provider deliveries from reclaiming queue-owned retries", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_001",
        now,
        maxAttempts: 1,
      }).ok,
    ).toBe(true);
    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_001",
        status: "failed",
        retryable: true,
        retryOwner: "provider",
        now: "2026-06-04T18:01:00.000Z",
        expectedAttempts: 1,
        maxAttempts: 1,
      }).ok,
    ).toBe(true);
    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_001",
        status: "failed",
        retryable: true,
        retryOwner: "queue",
        now: "2026-06-04T18:01:01.000Z",
        expectedAttempts: 1,
        nextAttemptAfter: "2026-06-04T18:05:00.000Z",
        maxAttempts: 1,
      }).ok,
    ).toBe(true);

    const providerDelivery = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_queue_001",
      now: "2026-06-04T18:06:00.000Z",
      deliverySource: "provider",
    });
    const queueDelivery = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_queue_001",
      now: "2026-06-04T18:06:00.000Z",
      deliverySource: "queue",
      expectedAttempts: 1,
    });

    expect(providerDelivery.ok && providerDelivery.value).toMatchObject({
      outcome: "queueOwnedRetry",
      record: {
        retryOwner: "queue",
      },
    });
    expect(queueDelivery.ok && queueDelivery.value).toMatchObject({
      outcome: "failedRetryable",
      record: {
        status: "processing",
        retryable: false,
        attempts: 2,
        retryOwner: undefined,
      },
    });
  });

  it("lets queue deliveries reclaim queue-owned retries before app not-before time", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_early_001",
        now,
        maxAttempts: 3,
      }).ok,
    ).toBe(true);
    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_early_001",
        status: "failed",
        retryable: true,
        retryOwner: "queue",
        now: "2026-06-04T18:01:00.000Z",
        expectedAttempts: 1,
        nextAttemptAfter: "2026-06-04T18:10:00.000Z",
        maxAttempts: 3,
      }).ok,
    ).toBe(true);

    const queueDelivery = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_queue_early_001",
      now: "2026-06-04T18:02:00.000Z",
      deliverySource: "queue",
      expectedAttempts: 1,
    });

    expect(queueDelivery.ok && queueDelivery.value).toMatchObject({
      outcome: "failedRetryable",
      record: {
        status: "processing",
        retryable: false,
        attempts: 2,
        retryOwner: undefined,
      },
    });
  });

  it("skips stale queue deliveries with mismatched retry generations", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_stale_001",
        now,
      }).ok,
    ).toBe(true);
    expect(
      markWebhookEventStatus(repository, {
        provider: "stripe",
        eventId: "evt_opaque_queue_stale_001",
        status: "failed",
        retryable: true,
        retryOwner: "queue",
        now: "2026-06-04T18:01:00.000Z",
        expectedAttempts: 1,
        maxAttempts: 3,
      }).ok,
    ).toBe(true);

    const stale = claimWebhookEvent(repository, {
      provider: "stripe",
      eventId: "evt_opaque_queue_stale_001",
      now: "2026-06-04T18:02:00.000Z",
      deliverySource: "queue",
      expectedAttempts: 0,
    });

    expect(stale.ok && stale.value).toMatchObject({
      outcome: "staleQueueDelivery",
      record: {
        status: "failed",
        retryable: true,
        attempts: 1,
        retryOwner: "queue",
      },
    });
  });

  it("does not reclaim an expired processing lease after max attempts", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      claimWebhookEvent(repository, {
        provider: "mdi",
        eventId: "mdi_evt_exhaust_001",
        now,
        processingLeaseSeconds: 60,
        maxAttempts: 1,
      }).ok,
    ).toBe(true);

    const exhausted = claimWebhookEvent(repository, {
      provider: "mdi",
      eventId: "mdi_evt_exhaust_001",
      now: "2026-06-04T18:01:01.000Z",
    });

    expect(exhausted.ok && exhausted.value).toMatchObject({
      outcome: "retryExhausted",
      record: {
        status: "failed",
        retryable: false,
        attempts: 1,
        retryExhaustedAt: "2026-06-04T18:01:01.000Z",
      },
    });
  });

  it("records launch-critical evidence events with opaque IDs and statuses", () => {
    const repository = createInMemoryAppDataRepository();

    const consent = recordEvidenceEvent(repository, {
      cognitoSub: "cognito-sub-001",
      eventId: "consent:terms-2026-06-04",
      eventType: "consent_granted",
      eventCategory: "consent",
      occurredAt: now,
      recordedAt: now,
      actorType: "patient",
      status: "succeeded",
      summaryCode: "CONSENT_GRANTED",
      source: "app",
      metadata: { version: "terms-2026-06-04" },
    });
    const mdiHandoff = recordEvidenceEvent(repository, {
      cognitoSub: "cognito-sub-001",
      eventId: "mdi:handoff:mdi_case_001",
      eventType: "mdi_handoff_submitted",
      eventCategory: "mdi_handoff",
      occurredAt: "2026-06-04T18:01:00.000Z",
      recordedAt: "2026-06-04T18:01:01.000Z",
      actorType: "system",
      status: "succeeded",
      summaryCode: "MDI_HANDOFF_SUBMITTED",
      mdiPatientId: "mdi_patient_001",
      mdiCaseId: "mdi_case_001",
      source: "mdi",
    });
    const stripeActivation = recordEvidenceEvent(repository, {
      cognitoSub: "cognito-sub-001",
      eventId: "stripe:billing:sub_opaque_001:active",
      eventType: "stripe_billing_activated",
      eventCategory: "stripe_billing",
      occurredAt: "2026-06-04T18:02:00.000Z",
      recordedAt: "2026-06-04T18:02:01.000Z",
      actorType: "system",
      status: "succeeded",
      summaryCode: "STRIPE_BILLING_ACTIVATED",
      stripeCustomerId: "cus_opaque_001",
      stripeSubscriptionId: "sub_opaque_001",
      source: "stripe",
    });
    const webhookSideEffect = recordEvidenceEvent(repository, {
      cognitoSub: "cognito-sub-001",
      eventId: createWebhookEvidenceEventId(
        "stripe",
        "evt_opaque_001",
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "billing_status_update",
      ),
      eventType: "webhook_side_effect_applied",
      eventCategory: "webhook",
      occurredAt: "2026-06-04T18:03:00.000Z",
      recordedAt: "2026-06-04T18:03:01.000Z",
      actorType: "system",
      status: "succeeded",
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      webhookProvider: "stripe",
      webhookEventId: "evt_opaque_001",
      stripeCustomerId: "cus_opaque_001",
      stripeSubscriptionId: "sub_opaque_001",
      requestId: "req_opaque_001",
      source: "webhook",
      metadata: { side_effect: "billing_status_update" },
    });

    expect(consent.ok).toBe(true);
    expect(mdiHandoff.ok).toBe(true);
    expect(stripeActivation.ok).toBe(true);
    expect(webhookSideEffect.ok).toBe(true);
    expect(repository.get(evidenceEventKey(
      "cognito-sub-001",
      now,
      "consent:terms-2026-06-04",
    ))).toMatchObject({
      ok: true,
      value: {
        recordType: "evidenceEvent",
        eventType: "consent_granted",
        status: "succeeded",
        source: "app",
      },
    });
    expect(repository.get(evidenceEventKey(
      "cognito-sub-001",
      "2026-06-04T18:01:00.000Z",
      "mdi:handoff:mdi_case_001",
    ))).toMatchObject({
      ok: true,
      value: {
        recordType: "evidenceEvent",
        eventType: "mdi_handoff_submitted",
        status: "succeeded",
        mdiCaseId: "mdi_case_001",
        source: "mdi",
      },
    });
    expect(repository.get(evidenceEventKey(
      "cognito-sub-001",
      "2026-06-04T18:02:00.000Z",
      "stripe:billing:sub_opaque_001:active",
    ))).toMatchObject({
      ok: true,
      value: {
        recordType: "evidenceEvent",
        eventType: "stripe_billing_activated",
        status: "succeeded",
        stripeSubscriptionId: "sub_opaque_001",
        source: "stripe",
      },
    });
    expect(repository.get(evidenceEventKey(
      "cognito-sub-001",
      "2026-06-04T18:03:00.000Z",
      createWebhookEvidenceEventId(
        "stripe",
        "evt_opaque_001",
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "billing_status_update",
      ),
    ))).toMatchObject({
      ok: true,
      value: {
        recordType: "evidenceEvent",
        eventType: "webhook_side_effect_applied",
        status: "succeeded",
        webhookProvider: "stripe",
        webhookEventId: "evt_opaque_001",
        source: "webhook",
      },
    });
    const read = repository.get(
      evidenceEventKey("cognito-sub-001", now, "consent:terms-2026-06-04"),
    );
    expect(read.ok && read.value).not.toHaveProperty("mdiPatientId");
    expect(read.ok && read.value).not.toHaveProperty("stripeCustomerId");
    expect(read.ok && read.value).not.toHaveProperty("webhookEventId");
    if (read.ok && read.value?.recordType === "evidenceEvent" && read.value.metadata) {
      read.value.metadata.version = "mutated-after-read";
    }
    expect(
      repository.get(
        evidenceEventKey(
          "cognito-sub-001",
          now,
          "consent:terms-2026-06-04",
        ),
      ),
    ).toMatchObject({
      ok: true,
      value: { metadata: { version: "terms-2026-06-04" } },
    });
    expect(JSON.stringify(webhookSideEffect)).not.toContain("answer");
    expect(JSON.stringify(stripeActivation)).not.toContain("condition");
  });

  it("resolves case support lookups through the existing MDI reverse link", () => {
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
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "mdi:status:mdi_case_001:clinical_review",
        eventType: "mdi_status_updated",
        eventCategory: "mdi_handoff",
        occurredAt: "2026-06-04T18:04:00.000Z",
        recordedAt: "2026-06-04T18:04:01.000Z",
        actorType: "vendor",
        status: "recorded",
        summaryCode: "MDI_STATUS_UPDATED",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        source: "mdi",
        metadata: { status: "clinical_review" },
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "consent:terms-2026-06-04",
        eventType: "consent_granted",
        eventCategory: "consent",
        occurredAt: "2026-06-04T18:05:00.000Z",
        recordedAt: "2026-06-04T18:05:00.000Z",
        actorType: "patient",
        status: "succeeded",
        summaryCode: "CONSENT_GRANTED",
        source: "app",
        metadata: { version: "terms-2026-06-04" },
      }).ok,
    ).toBe(true);

    const resolved = findPatientByMdiPointer(repository, {
      pointerType: "case",
      mdiCaseId: "mdi_case_001",
    });

    expect(resolved).toEqual({ ok: true, value: "cognito-sub-001" });
    expect(
      resolved.ok &&
        resolved.value &&
        repository.get(
          evidenceEventKey(
            resolved.value,
            "2026-06-04T18:04:00.000Z",
            "mdi:status:mdi_case_001:clinical_review",
          ),
        ),
    ).toMatchObject({ ok: true, value: { recordType: "evidenceEvent" } });
    expect(
      listEvidenceEventsForPatient(repository, {
        cognitoSub: "cognito-sub-001",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            recordType: "evidenceEvent",
            eventType: "mdi_status_updated",
            mdiCaseId: "mdi_case_001",
          },
          {
            recordType: "evidenceEvent",
            eventType: "consent_granted",
          },
        ],
      },
    });
    expect(
      listEvidenceEventsForMdiCase(repository, {
        mdiCaseId: "mdi_case_001",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        cognitoSub: "cognito-sub-001",
        items: [
          {
            recordType: "evidenceEvent",
            eventType: "mdi_status_updated",
            mdiCaseId: "mdi_case_001",
          },
        ],
      },
    });
    expect(
      listEvidenceEventsForPatient(repository, {
        cognitoSub: "cognito-sub-001",
        limit: 1,
      }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ eventType: "mdi_status_updated" }] },
    });
  });

  it("paginates filtered MDI case evidence without skipping matching events", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      linkMdiPatientCase(repository, {
        cognitoSub: "cognito-sub-001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        now,
      }).ok,
    ).toBe(true);

    const evidence = [
      {
        eventId: "mdi:status:mdi_case_001:clinical_review",
        eventType: "mdi_status_updated",
        eventCategory: "mdi_handoff",
        occurredAt: "2026-06-04T18:00:00.000Z",
        actorType: "vendor",
        status: "recorded",
        summaryCode: "MDI_STATUS_UPDATED",
        metadata: { status: "clinical_review" },
      },
      {
        eventId: "consent:terms-2026-06-04",
        eventType: "consent_granted",
        eventCategory: "consent",
        occurredAt: "2026-06-04T18:01:00.000Z",
        actorType: "patient",
        status: "succeeded",
        summaryCode: "CONSENT_GRANTED",
        metadata: { version: "terms-2026-06-04" },
      },
      {
        eventId: "mdi:status:mdi_case_001:completed",
        eventType: "mdi_status_updated",
        eventCategory: "mdi_handoff",
        occurredAt: "2026-06-04T18:02:00.000Z",
        actorType: "vendor",
        status: "recorded",
        summaryCode: "MDI_STATUS_UPDATED",
        metadata: { status: "completed" },
      },
      {
        eventId: "mdi:status:mdi_case_001:declined",
        eventType: "mdi_status_updated",
        eventCategory: "mdi_handoff",
        occurredAt: "2026-06-04T18:03:00.000Z",
        actorType: "vendor",
        status: "recorded",
        summaryCode: "MDI_STATUS_UPDATED",
        metadata: { status: "declined" },
      },
    ] as const;

    for (const event of evidence) {
      expect(
        recordEvidenceEvent(repository, {
          cognitoSub: "cognito-sub-001",
          recordedAt: event.occurredAt,
          mdiPatientId: event.eventCategory === "mdi_handoff" ? "mdi_patient_001" : undefined,
          mdiCaseId: event.eventCategory === "mdi_handoff" ? "mdi_case_001" : undefined,
          source: event.eventCategory === "mdi_handoff" ? "mdi" : "app",
          ...event,
        }).ok,
      ).toBe(true);
    }

    const firstPage = listEvidenceEventsForMdiCase(repository, {
      mdiCaseId: "mdi_case_001",
      limit: 2,
    });

    expect(firstPage).toMatchObject({
      ok: true,
      value: {
        items: [
          { eventId: "mdi:status:mdi_case_001:clinical_review" },
          { eventId: "mdi:status:mdi_case_001:completed" },
        ],
      },
    });
    expect(firstPage.ok && firstPage.value?.nextKey).toEqual(
      evidenceEventKey(
        "cognito-sub-001",
        "2026-06-04T18:02:00.000Z",
        "mdi:status:mdi_case_001:completed",
      ),
    );

    const secondPage = firstPage.ok && firstPage.value?.nextKey
      ? listEvidenceEventsForMdiCase(repository, {
          mdiCaseId: "mdi_case_001",
          cognitoSub: firstPage.value.cognitoSub,
          limit: 2,
          exclusiveStartKey: firstPage.value.nextKey,
        })
      : null;

    expect(secondPage).toMatchObject({
      ok: true,
      value: {
        items: [
          { eventId: "mdi:status:mdi_case_001:declined" },
        ],
      },
    });
    expect(secondPage && secondPage.ok && secondPage.value?.nextKey).toBeUndefined();
    expect(
      listEvidenceEventsForMdiCase(repository, {
        mdiCaseId: "mdi_case_001",
        cognitoSub: "cognito-sub-002",
        limit: 2,
        exclusiveStartKey: firstPage.ok ? firstPage.value?.nextKey : undefined,
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      listEvidenceEventsForMdiCase(repository, {
        mdiCaseId: "condition_context",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      listEvidenceEventsForPatient(repository, {
        cognitoSub: "patient@example.com",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      listEvidenceEventsForPatient(repository, {
        cognitoSub: "cognito-sub-001",
        limit: 0,
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
  });

  it("uses deterministic webhook evidence IDs across retry recordings", () => {
    const repository = createInMemoryAppDataRepository();
    const eventId = createWebhookEvidenceEventId(
      "mdi",
      "mdi_evt_approval_001",
      "WEBHOOK_SIDE_EFFECT_APPLIED",
      "mdi_status_update",
    );

    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId,
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:05:00.000Z",
        recordedAt: "2026-06-04T18:05:01.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "mdi",
        webhookEventId: "mdi_evt_approval_001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        source: "webhook",
        metadata: { side_effect: "mdi_status_update" },
      }).ok,
    ).toBe(true);

    expect(
      createWebhookEvidenceEventId(
        "mdi",
        "mdi_evt_approval_001",
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "mdi_status_update",
      ),
    ).toBe(eventId);
    const duplicate = recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId,
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:06:00.000Z",
        recordedAt: "2026-06-04T18:06:01.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "mdi",
        webhookEventId: "mdi_evt_approval_001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        source: "webhook",
        metadata: { side_effect: "mdi_status_update" },
      });
    expect(duplicate).toMatchObject({
      ok: true,
      value: {
        eventId,
        occurredAt: "2026-06-04T18:05:00.000Z",
      },
    });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId,
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:06:30.000Z",
        recordedAt: "2026-06-04T18:06:31.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "mdi",
        webhookEventId: "mdi_evt_approval_001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        requestId: "req_retry_002",
        source: "webhook",
        metadata: { side_effect: "mdi_status_update" },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        eventId,
        occurredAt: "2026-06-04T18:05:00.000Z",
      },
    });
    const requestIdReplay = recordEvidenceEvent(repository, {
      cognitoSub: "cognito-sub-001",
      eventId,
      eventType: "webhook_side_effect_applied",
      eventCategory: "webhook",
      occurredAt: "2026-06-04T18:06:45.000Z",
      recordedAt: "2026-06-04T18:06:46.000Z",
      actorType: "system",
      status: "succeeded",
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      webhookProvider: "mdi",
      webhookEventId: "mdi_evt_approval_001",
      mdiPatientId: "mdi_patient_001",
      mdiCaseId: "mdi_case_001",
      requestId: "req_retry_003",
      source: "webhook",
      metadata: { side_effect: "mdi_status_update" },
    });
    expect(requestIdReplay.ok && requestIdReplay.value).not.toHaveProperty("requestId");
    expect(
      repository.get(
        evidenceEventKey("cognito-sub-001", "2026-06-04T18:06:00.000Z", eventId),
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId,
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:07:00.000Z",
        recordedAt: "2026-06-04T18:07:01.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "mdi",
        webhookEventId: "mdi_evt_approval_001",
        source: "webhook",
        metadata: { side_effect: "mdi_status_update" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-002",
        eventId,
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:08:00.000Z",
        recordedAt: "2026-06-04T18:08:01.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "mdi",
        webhookEventId: "mdi_evt_approval_001",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        source: "webhook",
        metadata: { side_effect: "mdi_status_update" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "conditional_conflict" } });
  });

  it("allows distinct webhook side-effect evidence for the same provider event", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: createWebhookEvidenceEventId(
          "stripe",
          "evt_opaque_001",
          "WEBHOOK_SIDE_EFFECT_APPLIED",
          "billing_status_update",
        ),
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: now,
        recordedAt: now,
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "stripe",
        webhookEventId: "evt_opaque_001",
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: "sub_opaque_001",
        source: "webhook",
        metadata: { side_effect: "billing_status_update" },
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: createWebhookEvidenceEventId(
          "stripe",
          "evt_opaque_001",
          "WEBHOOK_SIDE_EFFECT_APPLIED",
          "webhook_idempotency_update",
        ),
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:01:00.000Z",
        recordedAt: "2026-06-04T18:01:00.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "stripe",
        webhookEventId: "evt_opaque_001",
        source: "webhook",
        metadata: { side_effect: "webhook_idempotency_update" },
      }).ok,
    ).toBe(true);
  });

  it("scopes non-webhook evidence uniqueness per patient", () => {
    const repository = createInMemoryAppDataRepository();
    const input = {
      eventId: "consent:terms-2026-06-04",
      eventType: "consent_granted",
      eventCategory: "consent",
      occurredAt: now,
      recordedAt: now,
      actorType: "patient",
      status: "succeeded",
      summaryCode: "CONSENT_GRANTED",
      source: "app",
      metadata: { version: "terms-2026-06-04" },
    } as const;

    expect(
      recordEvidenceEvent(repository, {
        ...input,
        cognitoSub: "cognito-sub-001",
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        ...input,
        cognitoSub: "cognito-sub-002",
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        ...input,
        cognitoSub: "cognito-sub-001",
        occurredAt: "2026-06-04T18:01:00.000Z",
      }),
    ).toMatchObject({ ok: false, error: { kind: "conditional_conflict" } });
  });

  it("requires evidence uniqueness records to point at canonical timeline keys", () => {
    expect(
      validateAppDataRecord({
        ...patientEvidenceEventUniquenessKey(
          "cognito-sub-001",
          "consent:terms-2026-06-04",
        ),
        recordType: "evidenceEventUniqueness",
        schemaVersion: 1,
        cognitoSub: "cognito-sub-001",
        eventId: "consent:terms-2026-06-04",
        evidencePk: "PATIENT#cognito-sub-001",
        evidenceSk:
          "EVIDENCE#2026-06-04T18:00:00.000Z#consent:terms-2026-06-04",
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ ok: true });

    expect(
      validateAppDataRecord({
        ...evidenceEventUniquenessKey("webhook:mdi:evt_001:WEBHOOK_PROCESSED"),
        recordType: "evidenceEventUniqueness",
        schemaVersion: 1,
        cognitoSub: "cognito-sub-001",
        eventId: "webhook:mdi:evt_001:WEBHOOK_PROCESSED",
        evidencePk: "PATIENT#cognito-sub-001",
        evidenceSk: "EVIDENCE#not-a-timestamp#webhook:mdi:evt_001:WEBHOOK_PROCESSED",
        createdAt: now,
        updatedAt: now,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid evidence event uniqueness record",
      },
    });
  });

  it("paginates patient evidence timelines without scanning uniqueness guards", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "consent:terms-2026-06-04",
        eventType: "consent_granted",
        eventCategory: "consent",
        occurredAt: "2026-06-04T18:00:00.000Z",
        recordedAt: "2026-06-04T18:00:00.000Z",
        actorType: "patient",
        status: "succeeded",
        summaryCode: "CONSENT_GRANTED",
        source: "app",
        metadata: { version: "terms-2026-06-04" },
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "mdi:handoff:mdi_case_001",
        eventType: "mdi_handoff_submitted",
        eventCategory: "mdi_handoff",
        occurredAt: "2026-06-04T18:01:00.000Z",
        recordedAt: "2026-06-04T18:01:00.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "MDI_HANDOFF_SUBMITTED",
        mdiPatientId: "mdi_patient_001",
        mdiCaseId: "mdi_case_001",
        source: "mdi",
      }).ok,
    ).toBe(true);

    const firstPage = listEvidenceEventsForPatient(repository, {
      cognitoSub: "cognito-sub-001",
      limit: 1,
    });

    expect(firstPage).toMatchObject({
      ok: true,
      value: { items: [{ eventType: "consent_granted" }] },
    });
    expect(firstPage.ok && firstPage.value.nextKey).toEqual({
      pk: "PATIENT#cognito-sub-001",
      sk: "EVIDENCE#2026-06-04T18:00:00.000Z#consent:terms-2026-06-04",
    });
    expect(
      firstPage.ok &&
        firstPage.value.nextKey &&
        listEvidenceEventsForPatient(repository, {
          cognitoSub: "cognito-sub-001",
          limit: 1,
          exclusiveStartKey: firstPage.value.nextKey,
        }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ eventType: "mdi_handoff_submitted" }] },
    });
  });

  it("requires event-specific linkage for case and billing evidence", () => {
    const repository = createInMemoryAppDataRepository();

    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "mdi:status:missing-linkage",
        eventType: "mdi_status_updated",
        eventCategory: "mdi_handoff",
        occurredAt: now,
        recordedAt: now,
        actorType: "vendor",
        status: "recorded",
        summaryCode: "MDI_STATUS_UPDATED",
        source: "mdi",
        metadata: { status: "clinical_review" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "mdi:handoff:failed:req_opaque_001",
        eventType: "mdi_handoff_failed",
        eventCategory: "mdi_handoff",
        occurredAt: now,
        recordedAt: now,
        actorType: "system",
        status: "failed",
        summaryCode: "MDI_HANDOFF_FAILED",
        requestId: "req_opaque_001",
        source: "mdi",
        metadata: { status: "failed", reason_code: "MDI_TIMEOUT" },
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "stripe:billing:missing-subscription",
        eventType: "stripe_billing_activated",
        eventCategory: "stripe_billing",
        occurredAt: "2026-06-04T18:01:00.000Z",
        recordedAt: "2026-06-04T18:01:00.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "STRIPE_BILLING_ACTIVATED",
        stripeCustomerId: "cus_opaque_001",
        source: "stripe",
        metadata: { status: "active" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "mdi:handoff:failed:req_opaque_002",
        eventType: "mdi_handoff_failed",
        eventCategory: "mdi_handoff",
        occurredAt: "2026-06-04T18:02:00.000Z",
        recordedAt: "2026-06-04T18:02:00.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "MDI_HANDOFF_FAILED",
        requestId: "req_opaque_002",
        source: "mdi",
        metadata: { status: "failed", reason_code: "MDI_TIMEOUT" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: createWebhookEvidenceEventId(
          "stripe",
          "evt_opaque_001",
          "WEBHOOK_SIDE_EFFECT_APPLIED",
          "billing_status_update",
        ),
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: "2026-06-04T18:02:00.000Z",
        recordedAt: "2026-06-04T18:02:00.000Z",
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "stripe",
        webhookEventId: "evt_opaque_001",
        source: "webhook",
        metadata: { side_effect: "billing_status_update" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
  });

  it("rejects evidence events with clinical, raw payload, or free-text metadata", () => {
    const repository = createInMemoryAppDataRepository();
    const baseEvidence = {
      cognitoSub: "cognito-sub-001",
      eventId: "support:case-review:001",
      eventType: "support_action_recorded",
      eventCategory: "support_admin",
      occurredAt: now,
      recordedAt: now,
      actorType: "admin",
      status: "recorded",
      summaryCode: "SUPPORT_ACTION_RECORDED",
      adminActorId: "admin_opaque_001",
      source: "support",
    } as const;

    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        metadata: { message_body: "patient wrote free text" },
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Invalid evidence event record",
      },
    });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:002",
        metadata: { raw_payload: "provider payload" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:003",
        metadata: { ip_address: "127.0.0.1" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:004",
        metadata: { status: "patient reports chest pain" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:005",
        metadata: { status: "127.0.0.1" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:chest_pain",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:006",
        metadata: { action_code: "chest_pain" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:007",
        metadata: { condition: "diabetes" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:008",
        metadata: { action_code: "case_lookup" },
      }).ok,
    ).toBe(true);
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:009",
        metadata: { action_code: "hiv_positive" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:010",
        metadata: { action_code: "opioid_use" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:011",
        metadata: { lab_a1c: 6.5 },
      } as never),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:012",
        metadata: { pregnancy_test_positive: true },
      } as never),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:013",
        requestId: "127.0.0.1",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:014",
        requestId: "127.0.0.1:443",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:015",
        requestId: "2001:db8::1",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:016",
        requestId: "req_127.0.0.1",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:017",
        source: "source:sk_live_x",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:018",
        metadata: { diagnosis: "clinical content" },
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Forbidden clinical field: diagnosis",
      },
    });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:019",
        eventType: "auth_sign_in",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:020",
        summaryCode: "CHEST_PAIN_REPORTED",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:021",
        occurredAt: "2026-06-04T18:00:00Z",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:022",
        eventType: "unknown_event_type",
      } as never),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: "random-webhook-id",
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: now,
        recordedAt: now,
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "stripe",
        webhookEventId: "evt_opaque_001",
        source: "webhook",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        cognitoSub: "cognito-sub-001",
        eventId: createWebhookEvidenceEventId(
          "stripe",
          "evt_opaque_002",
          "WEBHOOK_SIDE_EFFECT_APPLIED",
        ),
        eventType: "webhook_side_effect_applied",
        eventCategory: "webhook",
        occurredAt: now,
        recordedAt: now,
        actorType: "system",
        status: "succeeded",
        summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
        webhookProvider: "stripe",
        webhookEventId: "evt_opaque_002",
        source: "webhook",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:hiv_positive",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:023",
        source: "opioid_use",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      recordEvidenceEvent(repository, {
        ...baseEvidence,
        eventId: "support:case-review:024",
        requestId: "req_ozempic",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
    expect(
      validateAppDataRecord({
        ...evidenceEventKey("cognito-sub-001", now, "support:case-review:025"),
        recordType: "evidenceEvent",
        schemaVersion: 1,
        cognitoSub: "cognito-sub-001",
        eventId: "support:case-review:025",
        eventType: "support_action_recorded",
        eventCategory: "support_admin",
        occurredAt: now,
        recordedAt: now,
        actorType: "admin",
        status: "recorded",
        summaryCode: "SUPPORT_ACTION_RECORDED",
        adminActorId: "admin_opaque_001",
        source: "support",
        metadata: { action_code: "case_lookup" },
        createdAt: "2026-06-04T18:00:00Z",
        updatedAt: now,
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation_failed" } });
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
