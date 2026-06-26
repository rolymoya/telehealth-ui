import "server-only";

import type Stripe from "stripe";
import {
  findPatientByStripePointer,
  getStripeLinkage,
  listEvidenceEventsForPatient,
  recordEvidenceEvent,
  type AppDataRepository,
  type AppDataResult,
  type EvidenceEventRecord,
  type StripeLinkageRecord,
} from "@/lib/dynamodb/app-data";
import {
  refundActionContract,
  type RefundScenarioCode,
} from "@/lib/refund-action-contract";

export type StripeRefundEventFamily = "charge_refunded" | "dispute" | "refund";
export type StripeRefundEventStatus =
  | "closed"
  | "pending"
  | "requires_review"
  | "succeeded"
  | "unknown";

export type StripeRefundProcessingEvent = {
  eventFamily: StripeRefundEventFamily;
  eventId: string;
  eventStatus: StripeRefundEventStatus;
  occurredAt: string;
  refundScenario?: RefundScenarioCode;
  stripeCustomerId: string;
  stripeObjectId: string;
  stripeSubscriptionId?: string;
};

export type StripeRefundPointerResolver = (input: {
  chargeId?: string;
  event: Stripe.Event;
  eventFamily: StripeRefundEventFamily;
  paymentIntentId?: string;
  stripeObjectId: string;
}) => Promise<AppDataResult<{
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
} | null>>;

export type StripeRefundProcessingRepository = {
  findPatientByStripeCustomer(stripeCustomerId: string): Promise<AppDataResult<string | null>>;
  getStripeLinkage(cognitoSub: string): Promise<AppDataResult<StripeLinkageRecord | null>>;
  listRefundEvidence(input: {
    cognitoSub: string;
    stripeEventFamily: StripeRefundEventFamily;
    stripeObjectId: string;
    stripeSubscriptionId: string;
  }): Promise<AppDataResult<EvidenceEventRecord[]>>;
  recordEvidenceEvent(
    input: Parameters<typeof recordEvidenceEvent>[1],
  ): Promise<AppDataResult<EvidenceEventRecord>>;
};

export type StripeRefundProcessingResult =
  | {
      ok: true;
      status:
        | "duplicate"
        | "no_patient"
        | "out_of_order"
        | "recorded"
        | "subscription_mismatch"
        | "unresolved_pointer"
        | "unsupported_event";
    }
  | { ok: false; code: "storage_unavailable" };

export async function processQueuedStripeRefundEvent(input: {
  event: Stripe.Event;
  now: string;
  repository: StripeRefundProcessingRepository;
  resolveStripePointer?: StripeRefundPointerResolver;
}): Promise<StripeRefundProcessingResult> {
  const event = await normalizedQueuedStripeRefundEvent({
    event: input.event,
    resolveStripePointer: input.resolveStripePointer,
  });
  if (!event.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!event.value) {
    return { ok: true, status: event.status };
  }
  return processStripeRefundEvent({
    event: event.value,
    now: input.now,
    repository: input.repository,
  });
}

export function stripeRefundProcessingEventFromStripeEvent(
  event: Stripe.Event,
): StripeRefundProcessingEvent | null {
  const object = stripeEventObject(event);
  const eventFamily = refundEventFamily(event.type);
  if (!eventFamily) {
    return null;
  }
  const customer = objectString(object, "customer");
  const stripeObjectId = objectString(object, "id");
  const stripeSubscriptionId = objectString(object, "subscription");
  if (!customer || !stripeObjectId || !stripeSubscriptionId) {
    return null;
  }

  return {
    eventFamily,
    eventId: event.id,
    eventStatus: refundEventStatus(event.type, objectString(object, "status")),
    occurredAt: new Date(event.created * 1000).toISOString(),
    stripeCustomerId: customer,
    stripeObjectId,
    stripeSubscriptionId,
  };
}

export function createInMemoryStripeRefundProcessingRepository(
  repository: AppDataRepository,
): StripeRefundProcessingRepository {
  return {
    async findPatientByStripeCustomer(stripeCustomerId) {
      return findPatientByStripePointer(repository, {
        pointerType: "customer",
        stripeCustomerId,
      });
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkage(repository, cognitoSub);
    },
    async listRefundEvidence(input) {
      const eventIdPrefix =
        `stripe:refund:${input.stripeSubscriptionId}:${input.stripeEventFamily}:${input.stripeObjectId}:`;
      const events = listEvidenceEventsForPatient(repository, {
        cognitoSub: input.cognitoSub,
        limit: 100,
      });
      if (!events.ok) {
        return events;
      }
      return {
        ok: true,
        value: events.value.items.filter((event) => (
          event.eventType === "stripe_refund_status_changed" &&
          event.stripeSubscriptionId === input.stripeSubscriptionId &&
          event.metadata?.stripe_event_family === input.stripeEventFamily &&
          event.eventId.startsWith(eventIdPrefix)
        )),
      };
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEvent(repository, input);
    },
  };
}

export async function processStripeRefundEvent(input: {
  event: StripeRefundProcessingEvent;
  now: string;
  repository: StripeRefundProcessingRepository;
}): Promise<StripeRefundProcessingResult> {
  const patient = await input.repository.findPatientByStripeCustomer(
    input.event.stripeCustomerId,
  );
  if (!patient.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!patient.value) {
    return { ok: true, status: "no_patient" };
  }

  const linkage = await input.repository.getStripeLinkage(patient.value);
  if (!linkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!isMatchingSubscription(linkage.value, input.event)) {
    return { ok: true, status: "subscription_mismatch" };
  }

  const existing = await input.repository.listRefundEvidence({
    cognitoSub: patient.value,
    stripeEventFamily: input.event.eventFamily,
    stripeObjectId: input.event.stripeObjectId,
    stripeSubscriptionId: linkage.value.stripeSubscriptionId,
  });
  if (!existing.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (hasNewerOrEqualRefundStatus(existing.value, input.event.eventStatus)) {
    return { ok: true, status: "out_of_order" };
  }

  const scenario = input.event.refundScenario ?? "external_refund_event";
  const contract = refundActionContract(scenario);
  const patientStatus = refundStatusForStripeEvent(input.event, contract.patientStatus);
  const action = refundActionForStripeEvent(input.event, contract.defaultStripeAction);
  const recorded = await input.repository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: patient.value,
    eventCategory: "stripe_billing",
    eventId: `stripe:refund:${linkage.value.stripeSubscriptionId}:${input.event.eventFamily}:${input.event.stripeObjectId}:${input.event.eventId}`,
    eventType: "stripe_refund_status_changed",
    occurredAt: input.event.occurredAt,
    recordedAt: input.now,
    metadata: {
      refund_action: action,
      refund_scenario: scenario,
      refund_status: patientStatus,
      review_requirement: contract.evidence.metadata.review_requirement,
      stripe_event_family: input.event.eventFamily,
      stripe_event_status: input.event.eventStatus,
    },
    source: "stripe",
    status: "recorded",
    stripeCustomerId: input.event.stripeCustomerId,
    stripeSubscriptionId: linkage.value.stripeSubscriptionId,
    summaryCode: "STRIPE_REFUND_STATUS_CHANGED",
  });
  if (!recorded.ok) {
    return recorded.error.kind === "conditional_conflict"
      ? { ok: true, status: "duplicate" }
      : { ok: false, code: "storage_unavailable" };
  }

  return { ok: true, status: "recorded" };
}

function isMatchingSubscription(
  linkage: StripeLinkageRecord | null,
  event: StripeRefundProcessingEvent,
): linkage is StripeLinkageRecord & { stripeSubscriptionId: string } {
  if (!linkage?.stripeSubscriptionId) {
    return false;
  }
  return event.stripeSubscriptionId === linkage.stripeSubscriptionId;
}

function hasNewerOrEqualRefundStatus(
  events: EvidenceEventRecord[],
  nextStatus: StripeRefundEventStatus,
) {
  return events.some((event) => {
    const priorStatus = event.metadata?.stripe_event_status;
    return typeof priorStatus === "string" &&
      refundStatusPrecedence(priorStatus) >= refundStatusPrecedence(nextStatus);
  });
}

function refundStatusPrecedence(status: string) {
  switch (status) {
    case "succeeded":
    case "closed":
      return 3;
    case "requires_review":
      return 2;
    case "pending":
      return 1;
    default:
      return 0;
  }
}

function refundStatusForStripeEvent(
  event: StripeRefundProcessingEvent,
  fallback: ReturnType<typeof refundActionContract>["patientStatus"],
) {
  if (
    (event.eventFamily === "charge_refunded" || event.eventFamily === "refund") &&
    event.eventStatus === "succeeded"
  ) {
    return "refund_completed";
  }
  return fallback;
}

function refundActionForStripeEvent(
  event: StripeRefundProcessingEvent,
  fallback: ReturnType<typeof refundActionContract>["defaultStripeAction"],
) {
  if (
    (event.eventFamily === "charge_refunded" || event.eventFamily === "refund") &&
    event.eventStatus === "succeeded" &&
    event.refundScenario === undefined
  ) {
    return "no_op";
  }
  return fallback;
}

function refundEventFamily(eventType: string): StripeRefundEventFamily | null {
  switch (eventType) {
    case "charge.refunded":
      return "charge_refunded";
    case "refund.created":
    case "refund.updated":
      return "refund";
    case "charge.dispute.created":
    case "charge.dispute.closed":
      return "dispute";
    default:
      return null;
  }
}

async function normalizedQueuedStripeRefundEvent(input: {
  event: Stripe.Event;
  resolveStripePointer?: StripeRefundPointerResolver;
}): Promise<
  | { ok: true; value: StripeRefundProcessingEvent }
  | { ok: true; status: "unresolved_pointer" | "unsupported_event"; value: null }
  | { ok: false }
> {
  const direct = stripeRefundProcessingEventFromStripeEvent(input.event);
  if (direct) {
    return { ok: true, value: direct };
  }

  const object = stripeEventObject(input.event);
  const eventFamily = refundEventFamily(input.event.type);
  const stripeObjectId = objectString(object, "id");
  if (!eventFamily || !stripeObjectId) {
    return { ok: true, status: "unsupported_event", value: null };
  }
  if (!input.resolveStripePointer) {
    return { ok: true, status: "unresolved_pointer", value: null };
  }

  const pointer = await input.resolveStripePointer({
    chargeId: objectString(object, "charge") ?? undefined,
    event: input.event,
    eventFamily,
    paymentIntentId: objectString(object, "payment_intent") ?? undefined,
    stripeObjectId,
  });
  if (!pointer.ok) {
    return { ok: false };
  }
  if (!pointer.value) {
    return { ok: true, status: "unresolved_pointer", value: null };
  }

  return {
    ok: true,
    value: {
      eventFamily,
      eventId: input.event.id,
      eventStatus: refundEventStatus(input.event.type, objectString(object, "status")),
      occurredAt: new Date(input.event.created * 1000).toISOString(),
      stripeCustomerId: pointer.value.stripeCustomerId,
      stripeObjectId,
      stripeSubscriptionId: objectString(object, "subscription") ??
        pointer.value.stripeSubscriptionId,
    },
  };
}

function refundEventStatus(
  eventType: string,
  status: string | null,
): StripeRefundEventStatus {
  if (eventType === "charge.refunded") {
    return "succeeded";
  }
  if (eventType === "charge.dispute.created") {
    return "requires_review";
  }
  if (eventType === "charge.dispute.closed") {
    return "closed";
  }
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "pending":
      return "pending";
    case "failed":
    case "requires_action":
    case "canceled":
      return "requires_review";
    default:
      return "unknown";
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
