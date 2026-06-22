import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryPaymentMethodCollectionRepository,
  preparePaymentMethodCollection,
  type PaymentMethodStripeClient,
} from "@/lib/billing-payment-method";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  getStripeLinkage,
  linkMdiPatientCase,
  linkStripeCustomer,
  recordCurrentMdiCaseStatusEvidence,
} from "@/lib/dynamodb/app-data";

const cognitoSub = "cognito-sub-paymentmethod";
const mdiPatientId = "mdi_patient_paymentmethod_001";
const mdiCaseId = "mdi_case_paymentmethod_001";
const now = "2026-06-22T12:00:00.000Z";

describe("payment method collection preparation", () => {
  it("creates only a Stripe customer and hosted Checkout setup session before clinical approval", async () => {
    const repository = seededRepository("clinical_review");
    const stripe = stripeMock();

    const result = await preparePaymentMethodCollection({
      cognitoSub,
      now,
      repository: createInMemoryPaymentMethodCollectionRepository(repository),
      stage: "staging",
      stripe,
      urls: returnUrls,
    });

    expect(result).toEqual({
      ok: true,
      status: "checkout_session_created",
      billingStatus: "payment_method_pending",
      checkoutSessionId: "cs_opaque_001",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_opaque_001",
      stripeCustomerId: "cus_opaque_001",
    });
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(stripe.charges.create).not.toHaveBeenCalled();
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_pending",
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("uses only opaque identifiers in Stripe customer and Checkout setup metadata", async () => {
    const repository = seededRepository("clinical_review");
    const stripe = stripeMock();

    await preparePaymentMethodCollection({
      cognitoSub,
      now,
      repository: createInMemoryPaymentMethodCollectionRepository(repository),
      stage: "staging",
      stripe,
      urls: returnUrls,
    });

    const customerMetadata =
      (stripe.customers.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].metadata;
    const checkoutParams =
      (stripe.checkout.sessions.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(customerMetadata).toEqual(checkoutParams.metadata);
    expect(customerMetadata).toEqual(checkoutParams.setup_intent_data.metadata);
    expect(checkoutParams.mode).toBe("setup");
    expect(checkoutParams.subscription_data).toBeUndefined();
    expect(checkoutParams.line_items).toBeUndefined();
    expect(customerMetadata).toEqual({
      app_patient_id: expect.stringMatching(/^app_patient_[0-9a-f]{24}$/),
      apoth_stage: "staging",
      cognito_sub: cognitoSub,
      mdi_case_id: mdiCaseId,
      mdi_patient_id: mdiPatientId,
    });
    expect(JSON.stringify(customerMetadata)).not.toMatch(
      /questionnaire|answer|condition|diagnosis|symptom|medication|prescription|semaglutide/i,
    );
  });

  it("does not create charges or active billing for clinically declined cases", async () => {
    const repository = seededRepository("clinical_review");
    seedCaseStatus(repository, "declined");
    const stripe = stripeMock();

    await expect(preparePaymentMethodCollection({
      cognitoSub,
      now,
      repository: createInMemoryPaymentMethodCollectionRepository(repository),
      stage: "staging",
      stripe,
      urls: returnUrls,
    })).resolves.toEqual({ ok: false, code: "clinical_declined" });

    expectNoStripeMutation(stripe);
    expect(getStripeLinkage(repository, cognitoSub)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("keeps existing deferred Stripe linkage non-active when MDI later declines", async () => {
    for (const billingStatus of ["payment_method_pending", "payment_method_collected"] as const) {
      const repository = seededRepository("clinical_review");
      expect(linkStripeCustomer(repository, {
        billingStatus,
        cognitoSub,
        now,
        stripeCustomerId: `cus_existing_${billingStatus}`,
      }).ok).toBe(true);
      seedCaseStatus(repository, "declined");
      const stripe = stripeMock();

      await expect(preparePaymentMethodCollection({
        cognitoSub,
        now,
        repository: createInMemoryPaymentMethodCollectionRepository(repository),
        stage: "staging",
        stripe,
        urls: returnUrls,
      })).resolves.toEqual({ ok: false, code: "clinical_declined" });

      expectNoStripeMutation(stripe);
      expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
        ok: true,
        value: { billingStatus },
      });
    }
  });

  it("does not create charges or active billing for abandoned flows without an MDI case", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    const stripe = stripeMock();

    await expect(preparePaymentMethodCollection({
      cognitoSub,
      now,
      repository: createInMemoryPaymentMethodCollectionRepository(repository),
      stage: "staging",
      stripe,
      urls: returnUrls,
    })).resolves.toEqual({ ok: false, code: "payment_not_ready" });

    expectNoStripeMutation(stripe);
    expect(getStripeLinkage(repository, cognitoSub)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("does not create a new Checkout session when a payment method is already collected", async () => {
    const repository = seededRepository("clinical_review");
    expect(linkStripeCustomer(repository, {
      billingStatus: "payment_method_collected",
      cognitoSub,
      now,
      stripeCustomerId: "cus_existing_001",
    }).ok).toBe(true);
    const stripe = stripeMock();

    await expect(preparePaymentMethodCollection({
      cognitoSub,
      now,
      repository: createInMemoryPaymentMethodCollectionRepository(repository),
      stage: "staging",
      stripe,
      urls: returnUrls,
    })).resolves.toEqual({
      ok: true,
      status: "payment_method_already_collected",
      billingStatus: "payment_method_collected",
      stripeCustomerId: "cus_existing_001",
    });

    expectNoStripeMutation(stripe);
  });

  it("does not downgrade a concurrently collected or active billing mirror to pending", async () => {
    for (const billingStatus of ["payment_method_collected", "active", "canceled"] as const) {
      const repository = seededRepository("clinical_review");
      const baseRepository = createInMemoryPaymentMethodCollectionRepository(repository);
      const stripe = stripeMock();

      await expect(preparePaymentMethodCollection({
        cognitoSub,
        now,
        repository: {
          ...baseRepository,
          async linkStripeCustomer(input) {
            expect(linkStripeCustomer(repository, {
              billingStatus,
              cognitoSub,
              now,
              stripeCustomerId: "cus_concurrent_001",
              stripeSubscriptionId: billingStatus === "active" ? "sub_concurrent_001" : undefined,
            }).ok).toBe(true);
            return baseRepository.linkStripeCustomer(input);
          },
        },
        stage: "staging",
        stripe,
        urls: returnUrls,
      })).resolves.toEqual({ ok: false, code: "storage_unavailable" });

      expect(stripe.customers.create).toHaveBeenCalledTimes(1);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
        ok: true,
        value: { billingStatus },
      });
    }
  });
});

function seededRepository(
  onboardingStatus: Parameters<typeof createPatientProfileRecord>[0]["onboardingStatus"],
) {
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub,
      now,
      onboardingStatus,
      residencyState: "IL",
    }),
  ]);
  expect(linkMdiPatientCase(repository, {
    cognitoSub,
    mdiCaseId,
    mdiPatientId,
    now,
  }).ok).toBe(true);
  return repository;
}

function seedCaseStatus(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
  caseStatus: Parameters<typeof recordCurrentMdiCaseStatusEvidence>[1]["caseStatus"],
) {
  expect(recordCurrentMdiCaseStatusEvidence(repository, {
    actorType: "vendor",
    caseStatus,
    cognitoSub,
    eventCategory: "webhook",
    eventId: `webhook:mdi:mdi_evt_paymentmethod_${caseStatus}:WEBHOOK_SIDE_EFFECT_APPLIED:mdi_status_update`,
    eventType: "webhook_side_effect_applied",
    mdiCaseId,
    mdiPatientId,
    metadata: { side_effect: "mdi_status_update", case_status: caseStatus },
    occurredAt: now,
    recordedAt: now,
    source: "webhook",
    status: "succeeded",
    statusRank: caseStatus === "declined" ? 50 : 40,
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: caseStatus === "declined" || caseStatus === "cancelled",
    webhookEventId: `mdi_evt_paymentmethod_${caseStatus}`,
    webhookProvider: "mdi",
  }).ok).toBe(true);
}

function stripeMock() {
  return {
    charges: { create: vi.fn() },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({
          id: "cs_opaque_001",
          url: "https://checkout.stripe.com/c/pay/cs_opaque_001",
        })),
      },
    },
    customers: {
      create: vi.fn(async () => ({ id: "cus_opaque_001" })),
    },
    subscriptions: { create: vi.fn() },
  } as unknown as PaymentMethodStripeClient & {
    charges: { create: ReturnType<typeof vi.fn> };
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
    subscriptions: { create: ReturnType<typeof vi.fn> };
  };
}

function expectNoStripeMutation(stripe: ReturnType<typeof stripeMock>) {
  expect(stripe.customers.create).not.toHaveBeenCalled();
  expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  expect(stripe.charges.create).not.toHaveBeenCalled();
}

const returnUrls = {
  cancelUrl: "https://apoth.example/billing",
  successUrl: "https://apoth.example/dashboard",
};
