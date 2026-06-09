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

export function constructStripeWebhookEvent(input: {
  payload: string | Buffer;
  signature: string;
  stripe: Pick<Stripe, "webhooks">;
  webhookSigningSecret: string;
}): StripeResult<Stripe.Event> {
  try {
    return {
      ok: true,
      value: input.stripe.webhooks.constructEvent(
        input.payload,
        input.signature,
        input.webhookSigningSecret,
      ),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid_stripe_signature",
        message: "Stripe webhook signature could not be verified",
      },
    };
  }
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
