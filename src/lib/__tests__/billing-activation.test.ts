import { describe, expect, it, vi } from "vitest";
import {
  activateBillingAfterClinicalUnlock,
  cancelActiveBillingAfterClinicalClosure,
  cancelPatientSubscriptionAtPeriodEnd,
  createInMemoryBillingActivationRepository,
  type BillingActivationStripeClient,
} from "@/lib/billing-activation";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  getStripeLinkage,
  linkMdiPatientCase,
  linkStripeCustomer,
  listEvidenceEventsForPatient,
  recordCurrentMdiCaseStatusEvidence,
} from "@/lib/dynamodb/app-data";

const cognitoSub = "cognito-sub-billingactivation";
const mdiPatientId = "mdi_patient_billingactivation_001";
const mdiCaseId = "mdi_case_billingactivation_001";
const now = "2026-06-23T12:00:00.000Z";
const priceId = "price_launch_recurring_001";

describe("billing activation after MDI clinical unlock", () => {
  it("does not create a subscription before the billing unlock state", async () => {
    const repository = seededRepository({ caseStatus: "approved", billingStatus: "payment_method_collected" });
    const stripe = stripeMock();

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({ ok: true, status: "not_ready" });
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("requires a collected payment method before creating a subscription", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_pending" });
    const stripe = stripeMock();

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({ ok: true, status: "await_payment_method" });
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("creates one subscription after billing_ready using only the configured Price ID and opaque metadata", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_collected" });
    const stripe = stripeMock();

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({
      ok: true,
      status: "subscription_created",
      stripeSubscriptionId: "sub_opaque_001",
    });
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_opaque_001",
        items: [{ price: priceId }],
        metadata: {
          app_patient_id: expect.stringMatching(/^app_patient_[0-9a-f]{24}$/),
          apoth_stage: "staging",
          cognito_sub: cognitoSub,
          mdi_case_id: mdiCaseId,
          mdi_patient_id: mdiPatientId,
        },
      }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^apoth:staging:subscription:/) }),
    );
    expect(JSON.stringify(stripe.subscriptions.create.mock.calls[0][0])).not.toMatch(
      /approved|billing_ready|condition|diagnosis|symptom|medication|questionnaire|answer/i,
    );
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "active",
        stripeCurrentPeriodEnd: "2026-07-23T12:00:00.000Z",
        stripeCurrentPeriodStart: "2026-06-23T12:00:00.000Z",
        stripeSubscriptionId: "sub_opaque_001",
      },
    });
  });

  it("does not create duplicate subscriptions when activation is retried", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_collected" });
    const stripe = stripeMock();

    const first = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });
    const second = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now: "2026-06-23T12:00:01.000Z",
      priceId,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(first).toMatchObject({ ok: true, status: "subscription_created" });
    expect(second).toEqual({
      ok: true,
      status: "already_subscribed",
      stripeSubscriptionId: "sub_opaque_001",
    });
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
  });

  it("treats a post-Stripe local write conflict as success when the same subscription is already stored", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_collected" });
    const baseRepository = createInMemoryBillingActivationRepository(repository);
    const stripe = stripeMock();

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: {
        ...baseRepository,
        async linkStripeCustomer(input) {
          const linked = linkStripeCustomer(repository, {
            ...input,
            billingStatus: "active",
            stripeSubscriptionId: "sub_opaque_001",
          });
          expect(linked.ok).toBe(true);
          return {
            ok: false,
            error: { kind: "conditional_conflict", message: "Concurrent billing activation" },
          };
        },
      },
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({
      ok: true,
      status: "already_subscribed",
      stripeSubscriptionId: "sub_opaque_001",
    });
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
  });

  it("cancels a just-created subscription when the case closes before the local active mirror is stored", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_collected" });
    const baseRepository = createInMemoryBillingActivationRepository(repository);
    const stripe = stripeMock();

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: {
        ...baseRepository,
        async getMdiCaseStatusMirror(mdiCaseIdInput) {
          const mirror = await baseRepository.getMdiCaseStatusMirror(mdiCaseIdInput);
          if (mirror.ok && mirror.value?.caseStatus === "billing_ready") {
            seedCaseStatus(repository, "declined");
          }
          return mirror;
        },
      },
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({ ok: true, status: "clinical_closed" });
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      "sub_opaque_001",
      {},
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^apoth:staging:subscription-cancel:/) }),
    );
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("returns a retryable Stripe failure when compensating cancellation fails after a closure race", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_collected" });
    const baseRepository = createInMemoryBillingActivationRepository(repository);
    const stripe = stripeMock();
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("stripe unavailable"));

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: {
        ...baseRepository,
        async getMdiCaseStatusMirror(mdiCaseIdInput) {
          const mirror = await baseRepository.getMdiCaseStatusMirror(mdiCaseIdInput);
          if (mirror.ok && mirror.value?.caseStatus === "billing_ready") {
            seedCaseStatus(repository, "declined");
          }
          return mirror;
        },
      },
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({ ok: false, code: "stripe_unavailable" });
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("returns storage_unavailable when activation evidence cannot be written", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "payment_method_collected" });
    const baseRepository = createInMemoryBillingActivationRepository(repository);
    const stripe = stripeMock();

    const result = await activateBillingAfterClinicalUnlock({
      cognitoSub,
      mdiCaseId,
      now,
      priceId,
      repository: {
        ...baseRepository,
        async recordEvidenceEvent() {
          return {
            ok: false,
            error: { kind: "retryable_client_failure", message: "DynamoDB unavailable" },
          };
        },
      },
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({ ok: false, code: "storage_unavailable" });
  });

  it("does not activate clinically declined or abandoned flows", async () => {
    for (const setup of [
      { caseStatus: "declined" as const, billingStatus: "payment_method_collected" as const },
      { caseStatus: undefined, billingStatus: undefined },
    ]) {
      const repository = seededRepository(setup);
      const stripe = stripeMock();

      const result = await activateBillingAfterClinicalUnlock({
        cognitoSub,
        mdiCaseId,
        now,
        priceId,
        repository: createInMemoryBillingActivationRepository(repository),
        stage: "staging",
        stripe,
      });

      expect(result.ok).toBe(true);
      expect(stripe.subscriptions.create).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(stripe.charges.create).not.toHaveBeenCalled();
      const linkage = getStripeLinkage(repository, cognitoSub);
      expect(linkage.ok ? linkage.value?.billingStatus : undefined).not.toBe("active");
    }
  });

  it("cancels active billing when a later clinical closure requires cancel_active_billing", async () => {
    const repository = seededRepository({ caseStatus: "declined", billingStatus: "active" });
    const stripe = stripeMock();

    const result = await cancelActiveBillingAfterClinicalClosure({
      cognitoSub,
      mdiCaseId,
      now,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({
      ok: true,
      status: "subscription_canceled",
      stripeSubscriptionId: "sub_existing_001",
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "canceled",
        stripeSubscriptionId: "sub_existing_001",
      },
    });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 50 });
    const stripeEvidence = evidence.ok
      ? evidence.value.items.filter((event) => event.eventCategory === "stripe_billing")
      : [];
    expect(stripeEvidence).toHaveLength(1);
    expect(JSON.stringify(stripeEvidence)).not.toMatch(
      /declined|diagnosis|medication|questionnaire|answer/i,
    );
  });

  it("cancels past_due billing when a later clinical closure requires cancel_active_billing", async () => {
    const repository = seededRepository({ caseStatus: "declined", billingStatus: "past_due" });
    const stripe = stripeMock();

    const result = await cancelActiveBillingAfterClinicalClosure({
      cognitoSub,
      mdiCaseId,
      now,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({
      ok: true,
      status: "subscription_canceled",
      stripeSubscriptionId: "sub_existing_001",
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  it("lets patients schedule subscription cancellation at period end with bounded evidence", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "active" });
    const stripe = stripeMock();

    const result = await cancelPatientSubscriptionAtPeriodEnd({
      cognitoSub,
      now,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({
      ok: true,
      status: "subscription_cancel_pending",
      stripeSubscriptionId: "sub_existing_001",
    });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_existing_001",
      { cancel_at_period_end: true },
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^apoth:staging:subscription-cancel-period-end:/),
      }),
    );
    expect(JSON.stringify(stripe.subscriptions.update.mock.calls[0])).not.toMatch(
      /condition|diagnosis|symptom|medication|questionnaire|answer|reason/i,
    );
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "cancel_pending",
        stripeCurrentPeriodEnd: "2026-07-23T12:00:00.000Z",
        stripeSubscriptionId: "sub_existing_001",
      },
    });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 50 });
    const events = evidence.ok ? evidence.value.items : [];
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "stripe:billing:sub_existing_001:cancel_pending",
          eventType: "stripe_billing_status_changed",
          metadata: { status: "cancel_pending", previous_status: "active" },
          stripeSubscriptionId: "sub_existing_001",
        }),
        expect.objectContaining({
          eventId: "mdi:cancellation_review:mdi_case_billingactivation_001:sub_existing_001",
          eventType: "mdi_cancellation_review_requested",
          metadata: {
            outcome: "requested",
            reason_code: "patient_self_service_cancel",
            side_effect: "mdi_subscription_review",
          },
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toMatch(
      /condition|diagnosis|symptom|medication|questionnaire|answer|free.?text/i,
    );
  });

  it("does not duplicate patient cancellation work after the local mirror is cancel_pending", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "active" });
    const stripe = stripeMock();
    const billingRepository = createInMemoryBillingActivationRepository(repository);

    const first = await cancelPatientSubscriptionAtPeriodEnd({
      cognitoSub,
      now,
      repository: billingRepository,
      stage: "staging",
      stripe,
    });
    const second = await cancelPatientSubscriptionAtPeriodEnd({
      cognitoSub,
      now: "2026-06-23T12:00:01.000Z",
      repository: billingRepository,
      stage: "staging",
      stripe,
    });

    expect(first).toMatchObject({ ok: true, status: "subscription_cancel_pending" });
    expect(second).toEqual({
      ok: true,
      status: "already_cancel_pending",
      stripeSubscriptionId: "sub_existing_001",
    });
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
  });

  it("treats already canceled patient subscription cancellation as idempotent success", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "canceled" });
    const stripe = stripeMock();

    const result = await cancelPatientSubscriptionAtPeriodEnd({
      cognitoSub,
      now,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({
      ok: true,
      status: "already_canceled",
      stripeSubscriptionId: "sub_existing_001",
    });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("returns stripe_unavailable without changing the local mirror when patient cancellation fails", async () => {
    const repository = seededRepository({ caseStatus: "billing_ready", billingStatus: "active" });
    const stripe = stripeMock();
    stripe.subscriptions.update.mockRejectedValueOnce(new Error("stripe unavailable"));

    const result = await cancelPatientSubscriptionAtPeriodEnd({
      cognitoSub,
      now,
      repository: createInMemoryBillingActivationRepository(repository),
      stage: "staging",
      stripe,
    });

    expect(result).toEqual({ ok: false, code: "stripe_unavailable" });
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { billingStatus: "active" },
    });
  });
});

function seededRepository(input: {
  billingStatus?: "payment_method_pending" | "payment_method_collected" | "active" | "past_due" | "cancel_pending" | "canceled";
  caseStatus?: "approved" | "billing_ready" | "declined";
}) {
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub,
      now,
      onboardingStatus: input.caseStatus === "billing_ready" ? "billing_ready" : "clinical_review",
      residencyState: "IL",
    }),
  ]);
  if (input.caseStatus !== undefined) {
    expect(linkMdiPatientCase(repository, {
      cognitoSub,
      mdiCaseId,
      mdiPatientId,
      now,
    }).ok).toBe(true);
    expect(recordCurrentMdiCaseStatusEvidence(repository, {
      actorType: "vendor",
      caseStatus: input.caseStatus,
      cognitoSub,
      eventCategory: "webhook",
      eventId: `webhook:mdi:mdi_evt_billingactivation_${input.caseStatus}:WEBHOOK_SIDE_EFFECT_APPLIED:mdi_status_update`,
      eventType: "webhook_side_effect_applied",
      mdiCaseId,
      mdiPatientId,
      metadata: { side_effect: "mdi_status_update", case_status: input.caseStatus },
      occurredAt: now,
      recordedAt: now,
      source: "webhook",
      status: "succeeded",
      statusRank: input.caseStatus === "declined" ? 50 : input.caseStatus === "billing_ready" ? 30 : 25,
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      terminal: input.caseStatus === "declined",
      webhookEventId: `mdi_evt_billingactivation_${input.caseStatus}`,
      webhookProvider: "mdi",
    }).ok).toBe(true);
  }
  if (input.billingStatus !== undefined) {
    expect(linkStripeCustomer(repository, {
      billingStatus: input.billingStatus,
      cognitoSub,
      now,
      stripeBillingStatusObservedAt: now,
      stripeCustomerId: "cus_opaque_001",
      stripeCurrentPeriodEnd: input.billingStatus === "active" ||
        input.billingStatus === "past_due" ||
        input.billingStatus === "cancel_pending" ||
        input.billingStatus === "canceled"
        ? "2026-07-23T12:00:00.000Z"
        : undefined,
      stripeSubscriptionId: input.billingStatus === "active" ||
        input.billingStatus === "past_due" ||
        input.billingStatus === "cancel_pending" ||
        input.billingStatus === "canceled"
        ? "sub_existing_001"
        : undefined,
    }).ok).toBe(true);
  }
  return repository;
}

function seedCaseStatus(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
  caseStatus: "billing_ready" | "declined",
) {
  expect(recordCurrentMdiCaseStatusEvidence(repository, {
    actorType: "vendor",
    caseStatus,
    cognitoSub,
    eventCategory: "webhook",
    eventId: `webhook:mdi:mdi_evt_billingactivation_race_${caseStatus}:WEBHOOK_SIDE_EFFECT_APPLIED:mdi_status_update`,
    eventType: "webhook_side_effect_applied",
    mdiCaseId,
    mdiPatientId,
    metadata: { side_effect: "mdi_status_update", case_status: caseStatus },
    occurredAt: "2026-06-23T12:00:01.000Z",
    recordedAt: "2026-06-23T12:00:01.000Z",
    source: "webhook",
    status: "succeeded",
    statusRank: caseStatus === "declined" ? 50 : 30,
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: caseStatus === "declined",
    webhookEventId: `mdi_evt_billingactivation_race_${caseStatus}`,
    webhookProvider: "mdi",
  }).ok).toBe(true);
}

function stripeMock() {
  return {
    charges: { create: vi.fn() },
    paymentIntents: { create: vi.fn() },
    subscriptions: {
      cancel: vi.fn(async () => ({ id: "sub_existing_001", status: "canceled" })),
      create: vi.fn(async () => ({
        current_period_end: 1784808000,
        current_period_start: 1782216000,
        id: "sub_opaque_001",
        status: "active",
      })),
      update: vi.fn(async () => ({
        cancel_at_period_end: true,
        current_period_end: 1784808000,
        current_period_start: 1782216000,
        id: "sub_existing_001",
        status: "active",
      })),
    },
  } as unknown as BillingActivationStripeClient & {
    charges: { create: ReturnType<typeof vi.fn> };
    paymentIntents: { create: ReturnType<typeof vi.fn> };
    subscriptions: {
      cancel: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}
