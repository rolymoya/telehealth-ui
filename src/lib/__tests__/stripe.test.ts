import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  constructStripeWebhookEvent,
  createEnrollmentSetupCheckoutParams,
  createPaymentMethodSetupCheckoutParams,
  createPaymentMethodSetupIntentParams,
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
    expect(stripeApiVersion).toBe("2026-06-24.dahlia");
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

  it("creates SetupIntent params for deferred payment method collection", () => {
    const metadata = {
      app_patient_id: "app_patient_opaque_001",
      apoth_stage: "staging",
      mdi_case_id: "mdi_case_opaque_001",
    };

    const params = createPaymentMethodSetupIntentParams({
      customerId: "cus_opaque_001",
      metadata,
    });

    expect(params).toEqual({
      ok: true,
      value: {
        automatic_payment_methods: { enabled: true },
        customer: "cus_opaque_001",
        metadata,
        usage: "off_session",
      },
    });
    expect(params.ok && "subscription_data" in params.value).toBe(false);
    expect(params.ok && "line_items" in params.value).toBe(false);
  });

  it("creates Checkout setup params for hosted deferred payment method collection", () => {
    const metadata = {
      app_patient_id: "app_patient_opaque_001",
      apoth_stage: "staging",
      mdi_case_id: "mdi_case_opaque_001",
    };

    const params = createPaymentMethodSetupCheckoutParams({
      cancelUrl: "https://apoth.example/billing",
      customerId: "cus_opaque_001",
      metadata,
      successUrl: "https://apoth.example/dashboard",
    });

    expect(params).toEqual({
      ok: true,
      value: {
        cancel_url: "https://apoth.example/billing",
        customer: "cus_opaque_001",
        metadata,
        mode: "setup",
        setup_intent_data: { metadata },
        success_url: "https://apoth.example/dashboard",
      },
    });
    expect(params.ok && "subscription_data" in params.value).toBe(false);
    expect(params.ok && "line_items" in params.value).toBe(false);
  });

  it("creates anonymous ecommerce-style enrollment Checkout without charging", () => {
    const params = createEnrollmentSetupCheckoutParams({
      apothOrderId: "apoth_order_opaque_001",
      apothStage: "staging",
      cancelUrl: "https://www.apoth.example/weight-loss",
      expiresAt: 1_800_003_600,
      integrationIdentifier: "apoth_checkout_abcdefgh",
      successUrl: "https://account.apoth.example/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
    });

    expect(params).toEqual({
      ok: true,
      value: {
        cancel_url: "https://www.apoth.example/weight-loss",
        client_reference_id: "apoth_order_opaque_001",
        consent_collection: { terms_of_service: "required" },
        currency: "usd",
        custom_text: {
          submit: {
            message: "Your payment method will be saved for future purchases. You will not be charged today.",
          },
        },
        customer_creation: "always",
        expires_at: 1_800_003_600,
        integration_identifier: "apoth_checkout_abcdefgh",
        metadata: {
          apoth_order_id: "apoth_order_opaque_001",
          apoth_stage: "staging",
        },
        mode: "setup",
        setup_intent_data: {
          metadata: {
            apoth_order_id: "apoth_order_opaque_001",
            apoth_stage: "staging",
          },
        },
        success_url: "https://account.apoth.example/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
      },
    });

    if (params.ok) {
      expect("payment_method_types" in params.value).toBe(false);
      expect("payment_intent_data" in params.value).toBe(false);
      expect("subscription_data" in params.value).toBe(false);
      expect("line_items" in params.value).toBe(false);
      expect("customer_email" in params.value).toBe(false);
    }
  });

  it("rejects unsafe enrollment Checkout identifiers and return URLs", () => {
    expect(createEnrollmentSetupCheckoutParams({
      apothOrderId: "patient@example.com",
      apothStage: "staging",
      cancelUrl: "https://www.apoth.example/weight-loss",
      expiresAt: 1_800_003_600,
      integrationIdentifier: "apoth_checkout_abcdefgh",
      successUrl: "https://account.apoth.example/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
    })).toMatchObject({
      ok: false,
      error: { code: "unsafe_value" },
    });

    expect(createEnrollmentSetupCheckoutParams({
      apothOrderId: "apoth_order_opaque_001",
      apothStage: "staging",
      cancelUrl: "http://www.apoth.example/weight-loss",
      expiresAt: 1_800_003_600,
      integrationIdentifier: "apoth_checkout_abcdefgh",
      successUrl: "https://analytics.example/collect?session_id={CHECKOUT_SESSION_ID}",
    })).toEqual({
      ok: false,
      error: {
        code: "unsafe_checkout_url",
        message: "Enrollment Checkout URLs must use the approved HTTPS return contract",
      },
    });

    expect(createEnrollmentSetupCheckoutParams({
      apothOrderId: "apoth_order_opaque_001",
      apothStage: "staging",
      cancelUrl: "https://www.apoth.example/weight-loss",
      expiresAt: 1_800_003_600,
      integrationIdentifier: "apoth_checkout_12345678",
      successUrl: "https://account.apoth.example/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
    })).toEqual({
      ok: false,
      error: {
        code: "unsafe_integration_identifier",
        message: "Stripe integration identifier must end in eight ASCII letters",
      },
    });
  });

  it("allows loopback Checkout returns in staging but never in production", () => {
    const stagingInput = {
      apothOrderId: "apoth_order_opaque_001",
      cancelUrl: "http://127.0.0.1:3000/weight-loss",
      expiresAt: 1_800_003_600,
      integrationIdentifier: "apoth_checkout_abcdefgh",
      successUrl: "http://127.0.0.1:5173/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
    } as const;

    expect(createEnrollmentSetupCheckoutParams({
      ...stagingInput,
      apothStage: "staging",
    }).ok).toBe(true);
    expect(createEnrollmentSetupCheckoutParams({
      ...stagingInput,
      apothStage: "production",
    })).toMatchObject({
      ok: false,
      error: { code: "unsafe_checkout_url" },
    });
  });

  it("rejects PHI-shaped metadata before creating SetupIntent params", () => {
    expect(createPaymentMethodSetupIntentParams({
      customerId: "cus_opaque_001",
      metadata: {
        app_patient_id: "patient mentioned semaglutide",
      },
    })).toEqual({
      ok: false,
      error: {
        code: "phi_value",
        message: "Stripe metadata failed validation at app_patient_id",
      },
    });
  });

  it("rejects non-opaque metadata shapes under otherwise allowed keys", () => {
    const unsafeMetadataCases: Array<Record<string, string>> = [
      { app_patient_id: "Jane Doe" },
      { cognito_sub: "patient@example.com" },
      { mdi_case_id: "case for patient support" },
      { mdi_patient_id: "patient-id-without-prefix" },
      { apoth_stage: "preview" },
    ];

    for (const metadata of unsafeMetadataCases) {
      expect(validateStripeMetadata(metadata)).toEqual({
        valid: false,
        offendingKey: Object.keys(metadata)[0],
        reason: "unsafe_value",
      });
    }
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
