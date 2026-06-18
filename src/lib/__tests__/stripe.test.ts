import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  constructStripeWebhookEvent,
  createStripeClient,
  createStripeCustomerParams,
  createSubscriptionCheckoutParams,
  stripeApiVersion,
} from "@/lib/stripe";
import {
  buildStripeMetadata,
  validateStripeDescriptor,
  validateStripeMetadata,
} from "@/lib/stripe-policy";

describe("Stripe launch helpers", () => {
  it("constructs a test-mode Stripe client with the pinned latest API version", () => {
    const stripe = createStripeClient({ secretKey: "fake_stripe_secret_key" });

    expect(stripe.getApiField("version")).toBe(stripeApiVersion);
  });

  it("builds opaque metadata and rejects PHI-shaped metadata", () => {
    expect(buildStripeMetadata({
      apothStage: "staging",
      appPatientId: "app_patient_opaque_001",
      cognitoSub: "cognito-sub-0123456789abcdef",
      mdiCaseId: "mdi_case_opaque_001",
      mdiPatientId: "mdi_patient_opaque_001",
    })).toEqual({
      valid: true,
      metadata: {
        app_patient_id: "app_patient_opaque_001",
        apoth_stage: "staging",
        cognito_sub: "cognito-sub-0123456789abcdef",
        mdi_case_id: "mdi_case_opaque_001",
        mdi_patient_id: "mdi_patient_opaque_001",
      },
    });

    expect(validateStripeMetadata({
      app_patient_id: "questionnaire answer says no current medications",
    })).toEqual({
      valid: false,
      offendingKey: "app_patient_id",
      reason: "phi_value",
    });
  });

  it("rejects PHI-shaped descriptors controlled by Apoth", () => {
    for (const descriptor of [
      "Weight loss membership",
      "Semaglutide plan",
      "Clinician note review",
      "Questionnaire answer follow-up",
    ]) {
      expect(validateStripeDescriptor(descriptor)).toEqual({
        valid: false,
        reason: "phi_value",
      });
    }

    expect(validateStripeDescriptor("Apoth membership")).toEqual({ valid: true });
  });

  it("creates Checkout subscription params without hardcoded payment method types", () => {
    const metadata = {
      app_patient_id: "app_patient_opaque_001",
      apoth_stage: "staging",
      mdi_case_id: "mdi_case_opaque_001",
    };

    const params = createSubscriptionCheckoutParams({
      cancelUrl: "https://apoth.example/cancel",
      customerId: "cus_opaque_001",
      metadata,
      priceId: "price_opaque_001",
      successUrl: "https://apoth.example/success",
    });

    expect(params).toMatchObject({
      ok: true,
      value: {
        mode: "subscription",
        metadata,
        subscription_data: { metadata },
      },
    });
    expect(params.ok && "payment_method_types" in params.value).toBe(false);
  });

  it("validates metadata before returning customer params", () => {
    expect(createStripeCustomerParams({
      apothStage: "staging",
      appPatientId: "semaglutide candidate",
    })).toEqual({
      ok: false,
      error: {
        code: "phi_value",
        message: "Stripe metadata failed validation at app_patient_id",
      },
    });
  });

  it("delegates webhook signature verification to the Stripe SDK", () => {
    const event = { id: "evt_opaque_001", object: "event" } as Stripe.Event;
    const constructEvent = vi.fn(() => event);
    const stripe = {
      webhooks: { constructEvent },
    } as unknown as Pick<Stripe, "webhooks">;

    expect(constructStripeWebhookEvent({
      payload: "{}",
      signature: "t=123,v1=signature",
      stripe,
      webhookSigningSecret: "fake_stripe_webhook_signing_secret",
    })).toEqual({
      ok: true,
      value: event,
    });
    expect(constructEvent).toHaveBeenCalledWith(
      "{}",
      "t=123,v1=signature",
      "fake_stripe_webhook_signing_secret",
    );
  });

  it("falls back to an unexpired previous webhook signing secret during rotation", () => {
    const event = { id: "evt_opaque_002", object: "event" } as Stripe.Event;
    const currentSecret = "fake_current_stripe_webhook_signing_secret";
    const previousSecret = "fake_previous_stripe_webhook_signing_secret";
    const constructEvent = vi.fn((_payload: string | Buffer, _signature: string, secret: string) => {
      if (secret === previousSecret) {
        return event;
      }
      throw new Error("invalid signature");
    });
    const stripe = {
      webhooks: { constructEvent },
    } as unknown as Pick<Stripe, "webhooks">;

    expect(constructStripeWebhookEvent({
      payload: "{}",
      signature: "t=123,v1=signature",
      stripe,
      webhookSigningSecret: currentSecret,
      webhookSigningSecretPrevious: previousSecret,
      webhookSigningSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
      now: new Date("2029-12-31T23:59:59.000Z"),
    })).toEqual({
      ok: true,
      value: event,
    });
    expect(constructEvent).toHaveBeenNthCalledWith(
      1,
      "{}",
      "t=123,v1=signature",
      currentSecret,
    );
    expect(constructEvent).toHaveBeenNthCalledWith(
      2,
      "{}",
      "t=123,v1=signature",
      previousSecret,
    );
  });

  it("does not accept an expired previous webhook signing secret", () => {
    const constructEvent = vi.fn(() => {
      throw new Error("invalid signature");
    });
    const stripe = {
      webhooks: { constructEvent },
    } as unknown as Pick<Stripe, "webhooks">;

    expect(constructStripeWebhookEvent({
      payload: "{}",
      signature: "t=123,v1=signature",
      stripe,
      webhookSigningSecret: "fake_current_stripe_webhook_signing_secret",
      webhookSigningSecretPrevious: "fake_previous_stripe_webhook_signing_secret",
      webhookSigningSecretPreviousExpiresAt: "2029-12-31T23:59:59.000Z",
      now: new Date("2030-01-01T00:00:00.000Z"),
    })).toEqual({
      ok: false,
      error: {
        code: "invalid_stripe_signature",
        message: "Stripe webhook signature could not be verified",
      },
    });
    expect(constructEvent).toHaveBeenCalledTimes(1);
  });
});
