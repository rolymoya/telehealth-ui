import "server-only";

import Stripe from "stripe";
import type { StripeApiSecretPayload } from "@/lib/secrets/contracts";
import {
  buildStripeMetadata,
  validateStripeDescriptor,
  validateStripeMetadata,
  type StripeMetadataValidation,
} from "@/lib/stripe-policy";

export const stripeApiVersion = "2026-05-27.dahlia";

export type StripeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export function createStripeClient(secret: Pick<StripeApiSecretPayload, "secretKey">) {
  return new Stripe(secret.secretKey, {
    apiVersion: stripeApiVersion,
  });
}

export function createStripeCustomerParams(input: {
  apothStage: "staging" | "production";
  appPatientId: string;
  apothOrderId?: string;
  cognitoSub?: string;
  description?: string;
  mdiCaseId?: string;
  mdiPatientId?: string;
}): StripeResult<Stripe.CustomerCreateParams> {
  const metadata = buildStripeMetadata(input);
  if (!metadata.valid) {
    return validationErr(metadata);
  }

  const description = input.description ?? "Apoth account";
  const descriptor = validateStripeDescriptor(description);
  if (!descriptor.valid) {
    return descriptorErr(descriptor);
  }

  return {
    ok: true,
    value: {
      description,
      metadata: metadata.metadata,
    },
  };
}

export function createSubscriptionCheckoutParams(input: {
  cancelUrl: string;
  customerId: string;
  metadata: Record<string, string>;
  priceId: string;
  successUrl: string;
}): StripeResult<Stripe.Checkout.SessionCreateParams> {
  const metadata = validateStripeMetadata(input.metadata);
  if (!metadata.valid) {
    return validationErr(metadata);
  }

  return {
    ok: true,
    value: {
      cancel_url: input.cancelUrl,
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      metadata: input.metadata,
      mode: "subscription",
      subscription_data: {
        metadata: input.metadata,
      },
      success_url: input.successUrl,
    },
  };
}

export function createStripeSubscriptionParams(input: {
  customerId: string;
  metadata: Record<string, string>;
  priceId: string;
}): StripeResult<Stripe.SubscriptionCreateParams> {
  const metadata = validateStripeMetadata(input.metadata);
  if (!metadata.valid) {
    return validationErr(metadata);
  }

  return {
    ok: true,
    value: {
      customer: input.customerId,
      items: [{ price: input.priceId }],
      metadata: input.metadata,
      payment_behavior: "allow_incomplete",
    },
  };
}

export function createPaymentMethodSetupIntentParams(input: {
  customerId: string;
  metadata: Record<string, string>;
}): StripeResult<Stripe.SetupIntentCreateParams> {
  const metadata = validateStripeMetadata(input.metadata);
  if (!metadata.valid) {
    return validationErr(metadata);
  }

  return {
    ok: true,
    value: {
      automatic_payment_methods: { enabled: true },
      customer: input.customerId,
      metadata: input.metadata,
      usage: "off_session",
    },
  };
}

export function createPaymentMethodSetupCheckoutParams(input: {
  cancelUrl: string;
  customerId: string;
  metadata: Record<string, string>;
  successUrl: string;
}): StripeResult<Stripe.Checkout.SessionCreateParams> {
  const metadata = validateStripeMetadata(input.metadata);
  if (!metadata.valid) {
    return validationErr(metadata);
  }

  return {
    ok: true,
    value: {
      cancel_url: input.cancelUrl,
      customer: input.customerId,
      metadata: input.metadata,
      mode: "setup",
      setup_intent_data: {
        metadata: input.metadata,
      },
      success_url: input.successUrl,
    },
  };
}

export function constructStripeWebhookEvent(input: {
  payload: string | Buffer;
  signature: string;
  stripe: Pick<Stripe, "webhooks">;
  webhookSigningSecret: string;
  webhookSigningSecretPrevious?: string;
  webhookSigningSecretPreviousExpiresAt?: string;
  now?: Date;
}): StripeResult<Stripe.Event> {
  const secrets = activeStripeWebhookSigningSecrets(input);

  for (const secret of secrets) {
    try {
      return {
        ok: true,
        value: input.stripe.webhooks.constructEvent(
          input.payload,
          input.signature,
          secret,
        ),
      };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    error: {
      code: "invalid_stripe_signature",
      message: "Stripe webhook signature could not be verified",
    },
  };
}

function activeStripeWebhookSigningSecrets(input: {
  webhookSigningSecret: string;
  webhookSigningSecretPrevious?: string;
  webhookSigningSecretPreviousExpiresAt?: string;
  now?: Date;
}) {
  const secrets = [input.webhookSigningSecret];
  if (
    input.webhookSigningSecretPrevious &&
    input.webhookSigningSecretPreviousExpiresAt &&
    Date.parse(input.webhookSigningSecretPreviousExpiresAt) > (input.now ?? new Date()).getTime()
  ) {
    secrets.push(input.webhookSigningSecretPrevious);
  }

  return secrets;
}

function validationErr(
  validation: Extract<StripeMetadataValidation, { valid: false }>,
): StripeResult<never> {
  return {
    ok: false,
    error: {
      code: validation.reason,
      message: `Stripe metadata failed validation at ${validation.offendingKey}`,
    },
  };
}

function descriptorErr(
  validation: { valid: false; reason: "phi_value" | "unsafe_descriptor" },
): StripeResult<never> {
  return {
    ok: false,
    error: {
      code: validation.reason,
      message: "Stripe descriptor failed no-PHI validation",
    },
  };
}
