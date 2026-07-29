import "server-only";

import type Stripe from "stripe";
import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";
import {
  enrollmentAttemptMatchesBinding,
  verifyEnrollmentAttemptCookie,
} from "@/lib/enrollment/attempt-cookie";
import type { EnrollmentRecord } from "@/lib/enrollment/records";
import type { EnrollmentRepository } from "@/lib/enrollment/repository";
import { applyEnrollmentTransition } from "@/lib/enrollment/state-machine";

type CheckoutReturnStripeClient = {
  checkout: {
    sessions: {
      retrieve(
        sessionId: string,
        params: Stripe.Checkout.SessionRetrieveParams,
      ): Promise<unknown>;
    };
  };
};

export async function completeEnrollmentCheckoutReturn(input: {
  attemptCookie?: string | null;
  now?: Date;
  repository: EnrollmentRepository;
  sessionId: string;
  signingSecret: AppSigningSecret;
  stripe: CheckoutReturnStripeClient;
}): Promise<
  | { ok: true }
  | { ok: false; code: "invalid_return" | "checkout_unavailable" }
> {
  const now = input.now ?? new Date();
  const attempt = verifyEnrollmentAttemptCookie({
    now,
    secret: input.signingSecret,
    value: input.attemptCookie,
  });
  if (!attempt.ok || !/^cs_[A-Za-z0-9_]+$/.test(input.sessionId)) {
    return { ok: false, code: "invalid_return" };
  }

  const enrollmentResult = await input.repository.getEnrollment(
    attempt.payload.enrollmentId,
  );
  if (!enrollmentResult.ok) {
    return { ok: false, code: "checkout_unavailable" };
  }
  const enrollment = enrollmentResult.value;
  if (
    !enrollment ||
    !enrollmentAttemptMatchesBinding(
      attempt.payload.attemptSecret,
      enrollment.attemptBindingHash,
    ) ||
    enrollment.stripeCheckoutSessionId !== input.sessionId
  ) {
    return { ok: false, code: "invalid_return" };
  }

  let session: unknown;
  try {
    session = await input.stripe.checkout.sessions.retrieve(input.sessionId, {
      expand: ["customer", "setup_intent"],
    });
  } catch {
    return { ok: false, code: "checkout_unavailable" };
  }
  const evidence = validatedCheckoutReturnEvidence(session, enrollment.enrollmentId);
  if (!evidence) {
    return { ok: false, code: "invalid_return" };
  }

  if (
    enrollment.checkout === "completed" &&
    enrollment.stripeCustomerId === evidence.stripeCustomerId &&
    enrollment.stripeSetupIntentId === evidence.stripeSetupIntentId
  ) {
    return { ok: true };
  }

  const transitioned = applyEnrollmentTransition(enrollment, {
    changes: { checkout: "completed" },
  });
  if (!transitioned.ok) {
    return { ok: false, code: "invalid_return" };
  }
  const updated = await input.repository.updateEnrollment({
    ...enrollment,
    ...transitioned.value,
    stripeCustomerId: evidence.stripeCustomerId,
    stripeSetupIntentId: evidence.stripeSetupIntentId,
    updatedAt: now.toISOString(),
    version: enrollment.version + 1,
  }, enrollment.version);
  if (updated.ok) {
    return { ok: true };
  }

  const reread = await input.repository.getEnrollment(enrollment.enrollmentId);
  return reread.ok && reread.value?.checkout === "completed"
    ? { ok: true }
    : { ok: false, code: "checkout_unavailable" };
}

export async function readEnrollmentCheckoutStatus(input: {
  attemptCookie?: string | null;
  now?: Date;
  repository: EnrollmentRepository;
  signingSecret: AppSigningSecret;
}): Promise<
  | {
    ok: true;
    status:
      | "checkout_processing"
      | "verification_ready"
      | "account_ready"
      | "portal_ready"
      | "payment_setup_failed"
      | "restart_required";
  }
  | { ok: false; code: "invalid_attempt" | "status_unavailable" }
> {
  const now = input.now ?? new Date();
  const attempt = verifyEnrollmentAttemptCookie({
    now,
    secret: input.signingSecret,
    value: input.attemptCookie,
  });
  if (!attempt.ok) {
    return attempt.reason === "expired"
      ? { ok: true, status: "restart_required" }
      : { ok: false, code: "invalid_attempt" };
  }

  const result = await input.repository.getEnrollment(attempt.payload.enrollmentId);
  if (!result.ok) {
    return { ok: false, code: "status_unavailable" };
  }
  if (
    !result.value ||
    !enrollmentAttemptMatchesBinding(
      attempt.payload.attemptSecret,
      result.value.attemptBindingHash,
    )
  ) {
    return { ok: false, code: "invalid_attempt" };
  }
  return { ok: true, status: publicEnrollmentStatus(result.value) };
}

function publicEnrollmentStatus(record: EnrollmentRecord) {
  if (record.checkout === "expired" || record.checkout === "abandoned") {
    return "restart_required" as const;
  }
  if (record.paymentSetup === "failed" || record.paymentSetup === "detached") {
    return "payment_setup_failed" as const;
  }
  if (["ready", "issued", "launched"].includes(record.portalHandoff)) {
    return "portal_ready" as const;
  }
  if (record.identity === "verified") {
    return "account_ready" as const;
  }
  if (record.paymentSetup === "setup_succeeded") {
    return "verification_ready" as const;
  }
  return "checkout_processing" as const;
}

function validatedCheckoutReturnEvidence(
  value: unknown,
  enrollmentId: string,
) {
  if (!isRecord(value) ||
      value.id === undefined ||
      value.client_reference_id !== enrollmentId ||
      value.mode !== "setup" ||
      value.status !== "complete") {
    return null;
  }
  const stripeCustomerId = objectId(value.customer, "cus_");
  const setupIntent = isRecord(value.setup_intent) ? value.setup_intent : null;
  const stripeSetupIntentId = objectId(setupIntent, "seti_");
  const setupCustomerId = setupIntent
    ? objectId(setupIntent.customer, "cus_")
    : null;
  if (
    !stripeCustomerId ||
    !setupIntent ||
    setupIntent.status !== "succeeded" ||
    !stripeSetupIntentId ||
    setupCustomerId !== stripeCustomerId
  ) {
    return null;
  }
  return { stripeCustomerId, stripeSetupIntentId };
}

function objectId(value: unknown, prefix: string) {
  const id = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.id === "string"
      ? value.id
      : "";
  return id.startsWith(prefix) ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
