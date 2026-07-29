import "server-only";

import type Stripe from "stripe";
import type { EnrollmentRecord } from "@/lib/enrollment/records";
import type {
  EnrollmentRepository,
  EnrollmentRepositoryErrorCode,
} from "@/lib/enrollment/repository";
import { applyEnrollmentTransition } from "@/lib/enrollment/state-machine";

export type EnrollmentStripeWebhookResult =
  | { ok: true }
  | { ok: false; retryable: boolean };

export async function applyEnrollmentStripeWebhookEvent(input: {
  event: Stripe.Event;
  now: string;
  repository: EnrollmentRepository;
  stage: "staging" | "production";
}): Promise<EnrollmentStripeWebhookResult> {
  const evidence = enrollmentEvidence(input.event, input.stage);
  if (evidence.kind === "not_enrollment" || evidence.kind === "wrong_stage") {
    return { ok: true };
  }
  if (evidence.kind === "invalid") {
    return { ok: false, retryable: false };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await input.repository.getEnrollment(evidence.enrollmentId);
    if (!current.ok) {
      return repositoryFailure(current.error.code);
    }
    if (!current.value) {
      return { ok: false, retryable: true };
    }

    const next = reduceEnrollmentStripeEvidence({
      current: current.value,
      evidence,
      eventId: input.event.id,
      now: input.now,
    });
    if (!next.ok) {
      return next;
    }
    if (!next.value) {
      return { ok: true };
    }

    const updated = await input.repository.updateEnrollment(
      next.value,
      current.value.version,
    );
    if (updated.ok) {
      return { ok: true };
    }
    if (updated.error.code !== "conditional_conflict") {
      return repositoryFailure(updated.error.code);
    }
  }

  return { ok: false, retryable: true };
}

type EnrollmentStripeEvidence =
  | {
    kind: "checkout_completed";
    enrollmentId: string;
    stripeCheckoutSessionId: string;
    stripeCustomerId: string;
    stripeSetupIntentId: string;
  }
  | {
    kind: "checkout_expired";
    enrollmentId: string;
    stripeCheckoutSessionId: string;
  }
  | {
    kind: "setup_succeeded";
    enrollmentId: string;
    stripeCustomerId: string;
    stripeSetupIntentId: string;
  }
  | {
    kind: "setup_failed";
    enrollmentId: string;
    stripeCustomerId: string;
    stripeSetupIntentId: string;
  }
  | { kind: "not_enrollment" }
  | { kind: "wrong_stage" }
  | { kind: "invalid" };

function enrollmentEvidence(
  event: Stripe.Event,
  stage: "staging" | "production",
): EnrollmentStripeEvidence {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.expired" &&
    event.type !== "setup_intent.succeeded" &&
    event.type !== "setup_intent.setup_failed"
  ) {
    return { kind: "not_enrollment" };
  }

  const object = stripeEventObject(event);
  const metadata = isRecord(object.metadata) ? object.metadata : {};
  const rawEnrollmentId = metadata.apoth_order_id;
  if (rawEnrollmentId === undefined) {
    return { kind: "not_enrollment" };
  }
  if (metadata.apoth_stage !== stage) {
    return { kind: "wrong_stage" };
  }
  if (
    typeof rawEnrollmentId !== "string" ||
    !/^apoth_order_[A-Za-z0-9_]{8,128}$/.test(rawEnrollmentId)
  ) {
    return { kind: "invalid" };
  }

  if (event.type.startsWith("checkout.session.")) {
    const stripeCheckoutSessionId = objectId(object.id, "cs_");
    if (
      object.mode !== "setup" ||
      object.client_reference_id !== rawEnrollmentId ||
      !stripeCheckoutSessionId
    ) {
      return { kind: "invalid" };
    }
    if (event.type === "checkout.session.expired") {
      return {
        kind: "checkout_expired",
        enrollmentId: rawEnrollmentId,
        stripeCheckoutSessionId,
      };
    }
    const stripeCustomerId = objectId(object.customer, "cus_");
    const stripeSetupIntentId = objectId(object.setup_intent, "seti_");
    if (object.status !== "complete" || !stripeCustomerId || !stripeSetupIntentId) {
      return { kind: "invalid" };
    }
    return {
      kind: "checkout_completed",
      enrollmentId: rawEnrollmentId,
      stripeCheckoutSessionId,
      stripeCustomerId,
      stripeSetupIntentId,
    };
  }

  const stripeCustomerId = objectId(object.customer, "cus_");
  const stripeSetupIntentId = objectId(object.id, "seti_");
  if (!stripeCustomerId || !stripeSetupIntentId) {
    return { kind: "invalid" };
  }
  if (event.type === "setup_intent.succeeded" && object.status !== "succeeded") {
    return { kind: "invalid" };
  }
  return {
    kind: event.type === "setup_intent.succeeded" ? "setup_succeeded" : "setup_failed",
    enrollmentId: rawEnrollmentId,
    stripeCustomerId,
    stripeSetupIntentId,
  };
}

function reduceEnrollmentStripeEvidence(input: {
  current: EnrollmentRecord;
  evidence: Exclude<EnrollmentStripeEvidence, { kind: "not_enrollment" | "wrong_stage" | "invalid" }>;
  eventId: string;
  now: string;
}): { ok: true; value: EnrollmentRecord | null } | { ok: false; retryable: false } {
  const { current, evidence } = input;
  if (
    ("stripeCheckoutSessionId" in evidence &&
      current.stripeCheckoutSessionId !== undefined &&
      current.stripeCheckoutSessionId !== evidence.stripeCheckoutSessionId) ||
    ("stripeCustomerId" in evidence &&
      current.stripeCustomerId !== undefined &&
      current.stripeCustomerId !== evidence.stripeCustomerId) ||
    ("stripeSetupIntentId" in evidence &&
      current.stripeSetupIntentId !== undefined &&
      current.stripeSetupIntentId !== evidence.stripeSetupIntentId)
  ) {
    return { ok: false, retryable: false };
  }

  if (evidence.kind === "checkout_expired" && current.checkout === "completed") {
    return { ok: true, value: null };
  }
  if (evidence.kind === "setup_failed" && current.paymentSetup === "setup_succeeded") {
    return { ok: true, value: null };
  }

  const changes = evidence.kind === "checkout_completed"
    ? { checkout: "completed" as const }
    : evidence.kind === "checkout_expired"
      ? { checkout: "expired" as const }
      : evidence.kind === "setup_succeeded"
        ? { paymentSetup: "setup_succeeded" as const }
        : { paymentSetup: "failed" as const };
  const transitioned = applyEnrollmentTransition(current, {
    changes,
    ...(evidence.kind === "setup_succeeded"
      ? { evidence: { stripeEventId: input.eventId } }
      : {}),
  });
  if (!transitioned.ok) {
    return { ok: false, retryable: false };
  }

  const next: EnrollmentRecord = {
    ...current,
    ...transitioned.value,
    ...(evidence.kind === "checkout_completed"
      ? {
        stripeCheckoutSessionId: evidence.stripeCheckoutSessionId,
        stripeCustomerId: evidence.stripeCustomerId,
        stripeSetupIntentId: evidence.stripeSetupIntentId,
      }
      : evidence.kind === "checkout_expired"
        ? { stripeCheckoutSessionId: evidence.stripeCheckoutSessionId }
        : {
          stripeCustomerId: evidence.stripeCustomerId,
          stripeSetupIntentId: evidence.stripeSetupIntentId,
        }),
    updatedAt: input.now,
    version: current.version + 1,
  };

  return sameEnrollment(current, next)
    ? { ok: true, value: null }
    : { ok: true, value: next };
}

function repositoryFailure(code: EnrollmentRepositoryErrorCode) {
  return {
    ok: false as const,
    retryable: code !== "validation_failed" && code !== "expired",
  };
}

function stripeEventObject(event: Stripe.Event) {
  const data = event.data as { object?: unknown };
  return isRecord(data.object) ? data.object : {};
}

function objectId(value: unknown, prefix: string) {
  const id = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.id === "string"
      ? value.id
      : "";
  return id.startsWith(prefix) ? id : null;
}

function sameEnrollment(left: EnrollmentRecord, right: EnrollmentRecord) {
  const comparableRight = { ...right, updatedAt: left.updatedAt, version: left.version };
  return JSON.stringify(left) === JSON.stringify(comparableRight);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
