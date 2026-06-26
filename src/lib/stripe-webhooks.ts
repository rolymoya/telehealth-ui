import "server-only";

import type Stripe from "stripe";
import {
  type AppDataResult,
  type AppDataError,
  type AppDataRepository,
  type BillingStatus,
  type EvidenceEventRecord,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type StripeLinkageRecord,
  createWebhookEvidenceEventId,
  findPatientByStripePointer,
  getMdiLinkage,
  getStripeLinkage,
  linkStripeCustomer,
  mdiCaseStatusMirrorKey,
  recordEvidenceEvent,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  findPatientByStripePointerDynamoDb,
  getMdiLinkageDynamoDb,
  getStripeLinkageDynamoDb,
  linkStripeCustomerDynamoDb,
  recordEvidenceEventDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import type { StripeApiSecretPayload } from "@/lib/secrets/contracts";
import { constructStripeWebhookEvent } from "@/lib/stripe";
import {
  type ProcessVerifiedWebhookResult,
  type VerifiedWebhookEnvelope,
  type WebhookProcessingRepository,
  type WebhookQueueMessage,
  processVerifiedWebhook,
} from "@/lib/webhooks";

export const maxStripeWebhookPayloadBytes = 64 * 1024;

export type StripeWebhookResult =
  | { ok: true; status: 200; body: { received: true; action: "processed" | "skipped" | "queued" | "terminal_failed" } }
  | { ok: false; status: 400; body: { error: "invalid_signature" } }
  | { ok: false; status: 409; body: { error: "retry_later" } }
  | { ok: false; status: 500; body: { error: "webhook_processing_failed" } };

export type StripeWebhookEventHandling = "inline" | "queued" | "inline_queued" | "terminal";

export type StripeWebhookEventContract = {
  type: string;
  handling: StripeWebhookEventHandling;
};

export const stripeWebhookEventContracts = [
  { type: "setup_intent.succeeded", handling: "inline" },
  { type: "setup_intent.setup_failed", handling: "inline" },
  { type: "payment_method.attached", handling: "inline" },
  { type: "customer.subscription.created", handling: "inline" },
  { type: "customer.subscription.updated", handling: "inline" },
  { type: "customer.subscription.deleted", handling: "inline" },
  { type: "invoice.payment_succeeded", handling: "inline" },
  { type: "invoice.payment_failed", handling: "inline_queued" },
  { type: "charge.refunded", handling: "queued" },
  { type: "refund.created", handling: "queued" },
  { type: "refund.updated", handling: "queued" },
  { type: "charge.dispute.created", handling: "queued" },
  { type: "charge.dispute.closed", handling: "queued" },
  { type: "payment_intent.payment_failed", handling: "inline_queued" },
] as const satisfies StripeWebhookEventContract[];

export type HandleStripeWebhookInput = {
  billingActivation?: StripeBillingActivation;
  stripeMirrorRepository: StripeMirrorRepository;
  enqueue: (message: WebhookQueueMessage) => Promise<void>;
  payload: string | Buffer;
  receivedAt: string;
  secret: Pick<
    StripeApiSecretPayload,
    "webhookSigningSecret" | "webhookSigningSecretPrevious" | "webhookSigningSecretPreviousExpiresAt"
  >;
  signature: string;
  stripe: Pick<Stripe, "webhooks">;
  webhookRepository: WebhookProcessingRepository;
};

export type StripeBillingActivation = {
  activate(input: {
    cognitoSub: string;
    mdiCaseId: string;
    now: string;
    webhookEventId: string;
  }): Promise<{ ok: true } | { ok: false; retryable: boolean }>;
};

export type StripeMirrorRepository = {
  findPatientByStripeCustomer(stripeCustomerId: string): Promise<AppDataResult<string | null>>;
  getMdiCaseStatusMirror(mdiCaseId: string): Promise<AppDataResult<MdiCaseStatusMirrorRecord | null>>;
  getMdiLinkage(cognitoSub: string): Promise<AppDataResult<MdiLinkageRecord | null>>;
  getStripeLinkage(cognitoSub: string): Promise<AppDataResult<StripeLinkageRecord | null>>;
  linkStripeCustomer(input: {
    billingStatus: BillingStatus;
    cognitoSub: string;
    now: string;
    stripeCustomerId: string;
    stripeBillingStatusObservedAt?: string;
    stripeCurrentPeriodEnd?: string;
    stripeCurrentPeriodStart?: string;
    stripeSubscriptionId?: string;
  }): Promise<AppDataResult<StripeLinkageRecord>>;
  recordEvidenceEvent(
    input: Parameters<typeof recordEvidenceEvent>[1],
  ): Promise<AppDataResult<EvidenceEventRecord>>;
};

export function createInMemoryStripeMirrorRepository(
  repository: AppDataRepository,
): StripeMirrorRepository {
  return {
    async findPatientByStripeCustomer(stripeCustomerId) {
      return findPatientByStripePointer(repository, {
        pointerType: "customer",
        stripeCustomerId,
      });
    },
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return appDataValidationFailure("MDI case status mirror key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkage(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkage(repository, cognitoSub);
    },
    async linkStripeCustomer(input) {
      return linkStripeCustomer(repository, input);
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEvent(repository, input);
    },
  };
}

export function createDynamoDbStripeMirrorRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
): StripeMirrorRepository {
  return {
    async findPatientByStripeCustomer(stripeCustomerId) {
      return findPatientByStripePointerDynamoDb(repository, {
        pointerType: "customer",
        stripeCustomerId,
      });
    },
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = await repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return appDataValidationFailure("MDI case status mirror key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkageDynamoDb(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkageDynamoDb(repository, cognitoSub);
    },
    async linkStripeCustomer(input) {
      return linkStripeCustomerDynamoDb(repository, input);
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEventDynamoDb(repository, input);
    },
  };
}

export async function handleStripeWebhook(
  input: HandleStripeWebhookInput,
): Promise<StripeWebhookResult> {
  if (webhookPayloadByteLength(input.payload) > maxStripeWebhookPayloadBytes) {
    return { ok: false, status: 400, body: { error: "invalid_signature" } };
  }

  const verified = constructStripeWebhookEvent({
    payload: input.payload,
    signature: input.signature,
    stripe: input.stripe,
    webhookSigningSecret: input.secret.webhookSigningSecret,
    webhookSigningSecretPrevious: input.secret.webhookSigningSecretPrevious,
    webhookSigningSecretPreviousExpiresAt: input.secret.webhookSigningSecretPreviousExpiresAt,
    now: new Date(input.receivedAt),
  });
  if (!verified.ok) {
    return { ok: false, status: 400, body: { error: "invalid_signature" } };
  }

  const contract = stripeWebhookEventContracts.find(
    (candidate) => candidate.type === verified.value.type,
  );
  if (!contract) {
    return { ok: true, status: 200, body: { received: true, action: "terminal_failed" } };
  }

  const envelope: VerifiedWebhookEnvelope = {
    provider: "stripe",
    eventId: verified.value.id,
    eventCategory: "billing",
    routeCode: "stripe.billing",
    receivedAt: input.receivedAt,
    providerTimestamp: stripeCreatedToIso(verified.value.created),
  };

  let processed: ProcessVerifiedWebhookResult;
  try {
    processed = await processVerifiedWebhook({
      envelope,
      repository: input.webhookRepository,
      handler: async () => handleVerifiedStripeEvent({
        billingActivation: input.billingActivation,
        contract,
        event: verified.value,
        now: input.receivedAt,
        stripeMirrorRepository: input.stripeMirrorRepository,
      }),
      enqueue: input.enqueue,
      clock: () => input.receivedAt,
    });
  } catch {
    return { ok: false, status: 500, body: { error: "webhook_processing_failed" } };
  }

  return resultForProcessedWebhook(processed);
}

async function handleVerifiedStripeEvent(input: {
  billingActivation?: StripeBillingActivation;
  contract: StripeWebhookEventContract;
  event: Stripe.Event;
  now: string;
  stripeMirrorRepository: StripeMirrorRepository;
}) {
  if (input.contract.handling === "queued") {
    return retryableQueueResult();
  }

  const inline = await applyInlineStripeMirror(
    input.stripeMirrorRepository,
    input.event,
    input.now,
    input.billingActivation,
  );
  if (!inline.ok) {
    return {
      outcome: "failed" as const,
      retryable: inline.retryable,
      durableRetry: inline.retryable,
    };
  }

  if (input.contract.handling === "inline_queued") {
    return retryableQueueResult();
  }

  return { outcome: "processed" as const };
}

async function applyInlineStripeMirror(
  repository: StripeMirrorRepository,
  event: Stripe.Event,
  now: string,
  billingActivation?: StripeBillingActivation,
): Promise<
  | { ok: true }
  | { ok: false; retryable: boolean }
> {
  const customerId = stripeCustomerIdForEvent(event);
  const subscriptionId = stripeSubscriptionIdForEvent(event);
  const billingStatus = billingStatusForEvent(event);
  if (!customerId || !billingStatus) {
    return { ok: true };
  }

  const patient = await repository.findPatientByStripeCustomer(customerId);
  if (!patient.ok) {
    return appDataFailure(patient.error);
  }
  if (!patient.value) {
    return { ok: true };
  }

  const existing = await repository.getStripeLinkage(patient.value);
  if (!existing.ok) {
    return appDataFailure(existing.error);
  }
  const previousStatus = existing.value?.billingStatus ?? "not_started";
  const eventObservedAt = stripeCreatedToIso(event.created);
  const activationAllowed = await clinicalUnlockAllowsStripeBillingMirror(
    repository,
    patient.value,
    event,
    existing.value,
  );
  if (!activationAllowed.ok) {
    return activationAllowed;
  }
  if (!activationAllowed.value) {
    return { ok: true };
  }

  if (!shouldApplyStripeBillingMirror({
    billingStatus,
    event,
    eventObservedAt,
    eventSubscriptionId: subscriptionId,
    previousStatus,
    existingObservedAt: existing.value?.stripeBillingStatusObservedAt,
    existingSubscriptionId: existing.value?.stripeSubscriptionId,
  })) {
    return { ok: true };
  }

  const linked = await repository.linkStripeCustomer({
    cognitoSub: patient.value,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId ?? existing.value?.stripeSubscriptionId,
    billingStatus,
    now,
    stripeBillingStatusObservedAt: eventObservedAt,
    stripeCurrentPeriodEnd: stripeCurrentPeriodIsoForEvent(
      event,
      "end",
      existing.value?.stripeCurrentPeriodEnd,
    ),
    stripeCurrentPeriodStart: stripeCurrentPeriodIsoForEvent(
      event,
      "start",
      existing.value?.stripeCurrentPeriodStart,
    ),
  });
  if (!linked.ok) {
    return appDataFailure(linked.error);
  }

  const evidence = await recordStripeMirrorEvidence(repository, {
    billingStatus,
    cognitoSub: patient.value,
    event,
    now,
    previousStatus,
    stripeCustomerId: customerId,
    stripeSubscriptionId: linked.value.stripeSubscriptionId,
  });
  if (!evidence.ok) {
    if (evidence.error.kind === "conditional_conflict") {
      return { ok: true };
    }
    return appDataFailure(evidence.error);
  }

  if (
    billingActivation &&
    billingStatus === "payment_method_collected" &&
    linked.value.stripeSubscriptionId === undefined
  ) {
    const mdi = await repository.getMdiLinkage(patient.value);
    if (!mdi.ok) {
      return appDataFailure(mdi.error);
    }
    if (mdi.value?.mdiCaseId) {
      const mirror = await repository.getMdiCaseStatusMirror(mdi.value.mdiCaseId);
      if (!mirror.ok) {
        return appDataFailure(mirror.error);
      }
      if (mirror.value?.caseStatus !== "billing_ready") {
        return { ok: true };
      }
      const activation = await billingActivation.activate({
        cognitoSub: patient.value,
        mdiCaseId: mdi.value.mdiCaseId,
        now,
        webhookEventId: event.id,
      });
      if (!activation.ok) {
        return {
          ok: false,
          retryable: activation.retryable,
        };
      }
    }
  }

  return { ok: true };
}

async function recordStripeMirrorEvidence(
  repository: StripeMirrorRepository,
  input: {
    billingStatus: BillingStatus;
    cognitoSub: string;
    event: Stripe.Event;
    now: string;
    previousStatus: BillingStatus;
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
  },
) {
  if (
    input.billingStatus === "payment_method_collected" &&
    input.stripeSubscriptionId === undefined
  ) {
    return repository.recordEvidenceEvent({
      actorType: "vendor",
      cognitoSub: input.cognitoSub,
      eventCategory: "stripe_billing",
      eventId: `stripe:payment-method:${input.stripeCustomerId}:collected`,
      eventType: "stripe_payment_method_collected",
      occurredAt: input.now,
      recordedAt: input.now,
      source: "stripe",
      status: "succeeded",
      stripeCustomerId: input.stripeCustomerId,
      summaryCode: "STRIPE_PAYMENT_METHOD_COLLECTED",
      metadata: { status: "payment_method_collected" },
    });
  }

  if (input.stripeSubscriptionId === undefined) {
    return okEvidence();
  }

  const eventType = input.billingStatus === "active"
    ? "stripe_billing_activated"
    : "stripe_billing_status_changed";
  return repository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: input.cognitoSub,
    eventCategory: "stripe_billing",
    eventId: `stripe:billing:${input.stripeSubscriptionId}:${input.billingStatus}`,
    eventType,
    occurredAt: input.now,
    recordedAt: input.now,
    source: "stripe",
    status: eventType === "stripe_billing_activated" ? "succeeded" : "recorded",
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    summaryCode: eventType === "stripe_billing_activated"
      ? "STRIPE_BILLING_ACTIVATED"
      : "STRIPE_BILLING_STATUS_CHANGED",
    metadata: eventType === "stripe_billing_activated"
      ? { status: "active" }
      : { status: input.billingStatus, previous_status: input.previousStatus },
  });
}

function retryableQueueResult() {
  return {
    outcome: "failed" as const,
    retryable: true,
    durableRetry: true,
  };
}

function resultForProcessedWebhook(
  processed: ProcessVerifiedWebhookResult,
): StripeWebhookResult {
  if (processed.status === "accepted") {
    return { ok: true, status: 200, body: { received: true, action: processed.action } };
  }
  if (
    processed.reason === "already_processing" ||
    processed.reason === "retry_not_due" ||
    processed.reason === "handler_retryable_failure" ||
    processed.reason === "queue_send_failed" ||
    processed.reason === "queue_owner_mark_failed"
  ) {
    return { ok: false, status: 409, body: { error: "retry_later" } };
  }
  return { ok: false, status: 500, body: { error: "webhook_processing_failed" } };
}

function stripeCustomerIdForEvent(event: Stripe.Event) {
  const object = stripeEventObject(event);
  return objectString(object, "customer");
}

function stripeSubscriptionIdForEvent(event: Stripe.Event) {
  const object = stripeEventObject(event);
  return objectString(object, "subscription") ??
    (event.type.startsWith("customer.subscription.")
      ? objectString(object, "id")
      : null);
}

function billingStatusForEvent(event: Stripe.Event): BillingStatus | null {
  switch (event.type) {
    case "setup_intent.succeeded":
    case "payment_method.attached":
      return "payment_method_collected";
    case "setup_intent.setup_failed":
    case "payment_intent.payment_failed":
      return "payment_method_pending";
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return billingStatusForStripeSubscriptionStatus(
        objectString(stripeEventObject(event), "status"),
        objectBoolean(stripeEventObject(event), "cancel_at_period_end"),
      );
    case "customer.subscription.deleted":
      return "canceled";
    case "invoice.payment_succeeded":
      return "active";
    case "invoice.payment_failed":
      return "past_due";
    default:
      return null;
  }
}

function billingStatusForStripeSubscriptionStatus(
  status: string | null,
  cancelAtPeriodEnd = false,
): BillingStatus | null {
  if (
    cancelAtPeriodEnd &&
    (status === "active" || status === "trialing" || status === "past_due" || status === "unpaid")
  ) {
    return "cancel_pending";
  }
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "payment_method_pending";
    default:
      return null;
  }
}

function shouldApplyStripeBillingMirror(input: {
  billingStatus: BillingStatus;
  event: Stripe.Event;
  eventObservedAt: string;
  eventSubscriptionId: string | null;
  previousStatus: BillingStatus;
  existingObservedAt?: string;
  existingSubscriptionId?: string;
}) {
  if (
    input.existingObservedAt !== undefined &&
    isBefore(input.eventObservedAt, input.existingObservedAt)
  ) {
    return false;
  }

	if (input.event.type.startsWith("customer.subscription.")) {
		if (input.eventSubscriptionId === null) {
			return false;
		}
		if (
			input.existingObservedAt === input.eventObservedAt &&
			stripeBillingStatusPrecedence(input.billingStatus) <
				stripeBillingStatusPrecedence(input.previousStatus)
		) {
			return false;
		}
		return true;
	}

  if (input.event.type.startsWith("invoice.")) {
    if (!input.eventSubscriptionId) {
      return false;
    }
    if (input.previousStatus === "canceled") {
      return false;
    }
    if (input.previousStatus === "cancel_pending") {
      return false;
    }
    if (input.event.type === "invoice.payment_succeeded") {
      return input.previousStatus !== "past_due";
    }
    return true;
  }

  if (
    input.event.type === "setup_intent.succeeded" ||
    input.event.type === "setup_intent.setup_failed" ||
    input.event.type === "payment_method.attached" ||
    input.event.type === "payment_intent.payment_failed"
  ) {
    return input.existingSubscriptionId === undefined &&
      input.previousStatus !== "active" &&
      input.previousStatus !== "past_due" &&
      input.previousStatus !== "canceled";
  }

  return true;
}

function stripeEventObject(event: Stripe.Event) {
  const data = event.data as { object?: unknown };
  return isRecord(data.object) ? data.object : {};
}

function objectString(object: Record<string, unknown>, key: string) {
  const value = object[key];
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value) && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

function stripeCurrentPeriodIsoForEvent(
  event: Stripe.Event,
  boundary: "start" | "end",
  existing: string | undefined,
) {
  const object = stripeEventObject(event);
  const key = boundary === "start" ? "current_period_start" : "current_period_end";
  const direct = objectNumber(object, key);
  if (direct !== null) {
    return stripeCreatedToIso(direct);
  }

  const lines = object["lines"];
  if (isRecord(lines) && Array.isArray(lines.data)) {
    for (const line of lines.data) {
      if (!isRecord(line) || !isRecord(line.period)) {
        continue;
      }
      const periodValue = objectNumber(line.period, boundary);
      if (periodValue !== null) {
        return stripeCreatedToIso(periodValue);
      }
    }
  }

  return existing;
}

function objectNumber(object: Record<string, unknown>, key: string) {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectBoolean(object: Record<string, unknown>, key: string) {
  const value = object[key];
  return typeof value === "boolean" ? value : false;
}

function stripeCreatedToIso(created: number) {
  return new Date(created * 1000).toISOString();
}

function isBefore(left: string, right: string) {
	return new Date(left).getTime() < new Date(right).getTime();
}

function stripeBillingStatusPrecedence(status: BillingStatus) {
	switch (status) {
		case "canceled":
			return 5;
		case "cancel_pending":
			return 4;
		case "past_due":
			return 3;
		case "active":
			return 2;
		case "payment_method_pending":
			return 1;
		case "payment_method_collected":
		case "not_started":
			return 0;
	}
}

function appDataFailure(error: AppDataError) {
	return {
		ok: false as const,
		retryable: error.kind !== "validation_failed",
	};
}

async function clinicalUnlockAllowsStripeBillingMirror(
  repository: StripeMirrorRepository,
  cognitoSub: string,
  event: Stripe.Event,
  existing: StripeLinkageRecord | null,
): Promise<{ ok: true; value: boolean } | { ok: false; retryable: boolean }> {
  if (isPreUnlockPaymentMethodCollectionEvent(event)) {
    return { ok: true, value: true };
  }
  if (existing?.stripeSubscriptionId && isSubscribedOrClosedStatus(existing.billingStatus)) {
    return { ok: true, value: true };
  }

  const linkage = await repository.getMdiLinkage(cognitoSub);
  if (!linkage.ok) {
    return appDataFailure(linkage.error);
  }
  if (!linkage.value?.mdiCaseId) {
    return { ok: true, value: false };
  }

  const mirror = await repository.getMdiCaseStatusMirror(linkage.value.mdiCaseId);
  if (!mirror.ok) {
    return appDataFailure(mirror.error);
  }

  return {
    ok: true,
    value: mirror.value?.caseStatus === "billing_ready",
  };
}

function isPreUnlockPaymentMethodCollectionEvent(event: Stripe.Event) {
  return event.type === "setup_intent.succeeded" ||
    event.type === "payment_method.attached";
}

function isSubscribedOrClosedStatus(status: BillingStatus) {
  return status === "active" ||
    status === "past_due" ||
    status === "cancel_pending" ||
    status === "canceled";
}

function okEvidence() {
  return {
    ok: true as const,
    value: undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appDataValidationFailure(message: string): AppDataResult<never> {
  return {
    ok: false,
    error: { kind: "validation_failed", message },
  };
}

function webhookPayloadByteLength(payload: string | Buffer) {
  return typeof payload === "string" ? Buffer.byteLength(payload) : payload.byteLength;
}
