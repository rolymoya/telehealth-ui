import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { createEnrollmentRecord, type EnrollmentRecord } from "@/lib/enrollment/records";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";
import { applyEnrollmentStripeWebhookEvent } from "@/lib/enrollment/stripe-webhook";

describe("enrollment Stripe webhook reducer", () => {
  it("converges when SetupIntent succeeds before Checkout completion", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);

    expect(await applyEnrollmentStripeWebhookEvent({
      event: setupIntentEvent("evt_setup_first"),
      now: "2026-07-28T12:00:01.000Z",
      repository,
      stage: "staging",
    })).toEqual({ ok: true });
    expect(await applyEnrollmentStripeWebhookEvent({
      event: checkoutEvent("evt_checkout_second"),
      now: "2026-07-28T12:00:02.000Z",
      repository,
      stage: "staging",
    })).toEqual({ ok: true });

    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: {
        checkout: "completed",
        paymentSetup: "setup_succeeded",
        stripeCheckoutSessionId,
        stripeCustomerId,
        stripeSetupIntentId,
        version: 3,
      },
    });
  });

  it("converges when Checkout completion arrives before SetupIntent success", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);

    await applyEnrollmentStripeWebhookEvent({
      event: checkoutEvent("evt_checkout_first"),
      now: "2026-07-28T12:00:01.000Z",
      repository,
      stage: "staging",
    });
    await applyEnrollmentStripeWebhookEvent({
      event: setupIntentEvent("evt_setup_second"),
      now: "2026-07-28T12:00:02.000Z",
      repository,
      stage: "staging",
    });

    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: {
        checkout: "completed",
        paymentSetup: "setup_succeeded",
        version: 3,
      },
    });
  });

  it("is monotonic and does not rewrite a duplicate successful event", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);
    const event = setupIntentEvent("evt_setup_duplicate");

    await applyEnrollmentStripeWebhookEvent({
      event,
      now: "2026-07-28T12:00:01.000Z",
      repository,
      stage: "staging",
    });
    await applyEnrollmentStripeWebhookEvent({
      event,
      now: "2026-07-28T12:00:02.000Z",
      repository,
      stage: "staging",
    });

    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: { paymentSetup: "setup_succeeded", version: 2 },
    });
  });

  it("terminal-fails conflicting opaque Stripe linkage without changing enrollment", async () => {
    const repository = createInMemoryEnrollmentRepository([{
      ...openEnrollment(),
      stripeCustomerId: "cus_original_001",
    }]);

    const result = await applyEnrollmentStripeWebhookEvent({
      event: checkoutEvent("evt_conflict", {
        customer: "cus_different_002",
      }),
      now: "2026-07-28T12:00:01.000Z",
      repository,
      stage: "staging",
    });

    expect(result).toEqual({ ok: false, retryable: false });
    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: { checkout: "open", stripeCustomerId: "cus_original_001", version: 1 },
    });
  });

  it("ignores another environment and never crosses the stage boundary", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);

    const result = await applyEnrollmentStripeWebhookEvent({
      event: setupIntentEvent("evt_production", { apoth_stage: "production" }),
      now: "2026-07-28T12:00:01.000Z",
      repository,
      stage: "staging",
    });

    expect(result).toEqual({ ok: true });
    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: { paymentSetup: "pending", version: 1 },
    });
  });

  it("surfaces SetupIntent failure but never regresses a later success", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);
    const failed = setupIntentEvent("evt_failed", {}, "setup_intent.setup_failed");
    await applyEnrollmentStripeWebhookEvent({
      event: failed,
      now: "2026-07-28T12:00:01.000Z",
      repository,
      stage: "staging",
    });
    await applyEnrollmentStripeWebhookEvent({
      event: setupIntentEvent("evt_succeeded"),
      now: "2026-07-28T12:00:02.000Z",
      repository,
      stage: "staging",
    });
    await applyEnrollmentStripeWebhookEvent({
      event: failed,
      now: "2026-07-28T12:00:03.000Z",
      repository,
      stage: "staging",
    });

    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: { paymentSetup: "setup_succeeded", version: 3 },
    });
  });
});

const enrollmentId = "apoth_order_opaque_001";
const stripeCheckoutSessionId = "cs_opaque_001";
const stripeCustomerId = "cus_opaque_001";
const stripeSetupIntentId = "seti_opaque_001";

function openEnrollment(): EnrollmentRecord {
  return {
    ...createEnrollmentRecord({
      attemptBindingHash: `sha256:${"a".repeat(64)}`,
      catalogCode: "catalog_weight_001",
      enrollmentId,
      expiresAtEpochSeconds: 1_800_000_000,
      now: "2026-07-28T12:00:00.000Z",
    }),
    checkout: "open",
    stripeCheckoutSessionId,
  };
}

function checkoutEvent(
  id: string,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return stripeEvent(id, "checkout.session.completed", {
    id: stripeCheckoutSessionId,
    client_reference_id: enrollmentId,
    customer: stripeCustomerId,
    metadata: {
      apoth_order_id: enrollmentId,
      apoth_stage: "staging",
    },
    mode: "setup",
    setup_intent: stripeSetupIntentId,
    status: "complete",
    ...overrides,
  });
}

function setupIntentEvent(
  id: string,
  metadataOverrides: Record<string, unknown> = {},
  type: "setup_intent.succeeded" | "setup_intent.setup_failed" = "setup_intent.succeeded",
): Stripe.Event {
  return stripeEvent(id, type, {
    id: stripeSetupIntentId,
    customer: stripeCustomerId,
    metadata: {
      apoth_order_id: enrollmentId,
      apoth_stage: "staging",
      ...metadataOverrides,
    },
    status: type === "setup_intent.succeeded" ? "succeeded" : "requires_payment_method",
  });
}

function stripeEvent(
  id: string,
  type: Stripe.Event.Type,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id,
    type,
    api_version: "2026-06-24.dahlia",
    created: 1_775_000_000,
    data: { object },
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: null,
  } as unknown as Stripe.Event;
}
