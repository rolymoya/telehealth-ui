import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookProvider = "stripe" | "mdi";
export type WebhookRouteCode =
  | "stripe.billing"
  | "stripe.identity"
  | "mdi.case"
  | "mdi.patient";
export type WebhookEventCategory = "billing" | "identity" | "case" | "patient";

export type VerifyWebhookSignatureInput = {
  provider: WebhookProvider;
  payload: string | Buffer;
  secret: string;
  signatureHeader: string;
};

export type VerifyWebhookEnvelopeInput = VerifyWebhookSignatureInput & {
  receivedAt: string;
  now?: string;
  timestampToleranceSeconds?: number;
  mdiReplayToleranceSeconds?: number;
  futureTimestampToleranceSeconds?: number;
  maxPayloadBytes?: number;
};

export type WebhookRecordStatus = "processing" | "processed" | "failed";

export type ExistingWebhookRecord = {
  provider: WebhookProvider;
  eventId: string;
  status: WebhookRecordStatus;
  retryable: boolean;
  retryOwner?: "provider" | "queue" | "handoff";
  processingExpiresAt?: string;
  nextAttemptAfter?: string;
};

export type WebhookIdempotencyDecision =
  | { action: "process"; reason: "first_seen" }
  | { action: "skip"; reason: "duplicate_processed" | "duplicate_processing" | "queue_owned_retry" }
  | { action: "retry"; reason: "prior_retryable_failure" | "stale_processing" }
  | { action: "retry_later"; reason: "prior_retry_not_due" }
  | { action: "skip"; reason: "prior_terminal_failure" };

export type VerifiedWebhookEnvelope = {
  provider: WebhookProvider;
  eventId: string;
  eventCategory: WebhookEventCategory;
  routeCode: WebhookRouteCode;
  receivedAt: string;
  providerTimestamp?: string;
};

export type VerifyWebhookEnvelopeResult =
  | { ok: true; envelope: VerifiedWebhookEnvelope }
  | {
      ok: false;
      reason:
        | "invalid_signature"
        | "stale_signature"
        | "invalid_payload"
        | "invalid_event_id"
        | "unsupported_event_type"
        | "missing_provider_timestamp"
        | "stale_provider_timestamp";
    };

export type WebhookQueueMessage = {
  provider: WebhookProvider;
  eventId: string;
  eventCategory: WebhookEventCategory;
  routeCode: WebhookRouteCode;
  receivedAt: string;
  notBefore?: string;
  attempt: number;
  correlationId: string;
};

export type WebhookClaimState =
  | "claimed"
  | "alreadyProcessing"
  | "alreadyProcessed"
  | "failedRetryable"
  | "retryNotDue"
  | "queueOwnedRetry"
  | "staleQueueDelivery"
  | "processingLeaseExpired"
  | "retryExhausted"
  | "conflict";

export type ClaimedWebhookRecord = {
  provider: WebhookProvider;
  eventId: string;
  status: WebhookRecordStatus;
  retryable: boolean;
  retryOwner?: "provider" | "queue" | "handoff";
  attempts: number;
  processingExpiresAt?: string;
};

export type WebhookProcessingRepository = {
  claim(input: {
    provider: WebhookProvider;
    eventId: string;
    now: string;
    deliverySource?: "provider" | "queue";
    expectedAttempts?: number;
    processingLeaseSeconds?: number;
    maxAttempts?: number;
  }): Promise<{ outcome: WebhookClaimState; record: ClaimedWebhookRecord }>;
  markProcessed(input: {
    provider: WebhookProvider;
    eventId: string;
    now: string;
    expectedAttempts?: number;
    expectedProcessingExpiresAt?: string;
  }): Promise<void>;
  markFailed(input: {
    provider: WebhookProvider;
    eventId: string;
    retryable: boolean;
    now: string;
    expectedAttempts?: number;
    expectedProcessingExpiresAt?: string;
    retryOwner?: "provider" | "queue" | "handoff";
    nextAttemptAfter?: string;
    maxAttempts?: number;
  }): Promise<void>;
};

export type WebhookHandlerResult =
  | { outcome: "processed" }
  | {
      outcome: "failed";
      retryable: boolean;
      durableRetry: boolean;
      nextAttemptAfter?: string;
      maxAttempts?: number;
    };

export type ProcessVerifiedWebhookResult =
  | { status: "accepted"; action: "processed" | "skipped" | "queued" | "terminal_failed" }
  | {
      status: "retry";
      reason:
        | "already_processing"
        | "retry_not_due"
        | "queue_retry_exhausted"
        | "handler_retryable_failure"
        | "queue_send_failed"
        | "queue_owner_mark_failed";
    };

export function verifyWebhookSignature({
  provider,
  payload,
  secret,
  signatureHeader,
}: VerifyWebhookSignatureInput): boolean {
  if (!isUsableWebhookSecret(secret)) {
    return false;
  }

  const parsed = parseSignatureHeader(provider, signatureHeader);

  if (!parsed) {
    return false;
  }

  return verifyParsedWebhookSignature({ provider, payload, secret, parsed });
}

function verifyParsedWebhookSignature({
  provider,
  payload,
  secret,
  parsed,
}: {
  provider: WebhookProvider;
  payload: string | Buffer;
  secret: string;
  parsed: NonNullable<ReturnType<typeof parseSignatureHeader>>;
}) {
  const signedPayload =
    provider === "stripe" ? `${parsed.timestamp}.${payload.toString()}` : payload;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  return timingSafeHexEqual(expected, parsed.signature);
}

export function verifyWebhookEnvelope({
  provider,
  payload,
  secret,
  signatureHeader,
  receivedAt,
  now = receivedAt,
  timestampToleranceSeconds = 300,
  mdiReplayToleranceSeconds = 86_400,
  futureTimestampToleranceSeconds = 300,
  maxPayloadBytes = maxWebhookPayloadBytes,
}: VerifyWebhookEnvelopeInput): VerifyWebhookEnvelopeResult {
  if (!isUsableWebhookSecret(secret)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const parsedSignature = parseSignatureHeader(provider, signatureHeader);
  if (!parsedSignature) {
    return { ok: false, reason: "invalid_signature" };
  }
  if (webhookPayloadByteLength(payload) > maxPayloadBytes) {
    return { ok: false, reason: "invalid_payload" };
  }

  if (
    provider === "stripe" &&
    !isFreshUnixTimestamp(parsedSignature.timestamp, now, timestampToleranceSeconds)
  ) {
    return { ok: false, reason: "stale_signature" };
  }

  if (!verifyParsedWebhookSignature({ provider, payload, secret, parsed: parsedSignature })) {
    return { ok: false, reason: "invalid_signature" };
  }

  const parsedPayload = parseJsonPayload(payload);
  if (!parsedPayload) {
    return { ok: false, reason: "invalid_payload" };
  }

  const eventId = extractString(parsedPayload, ["id", "event_id", "eventId"]);
  const rawEventType = extractString(parsedPayload, ["type", "event_type", "event"]);
  if (!eventId || !rawEventType) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (!isAllowedWebhookEventId(provider, eventId)) {
    return { ok: false, reason: "invalid_event_id" };
  }

  const providerTimestamp = extractProviderTimestamp(parsedPayload);
  if (provider === "mdi" && !providerTimestamp) {
    return { ok: false, reason: "missing_provider_timestamp" };
  }
  if (
    provider === "mdi" &&
    providerTimestamp &&
    !isFreshIsoTimestamp(
      providerTimestamp,
      now,
      mdiReplayToleranceSeconds,
      futureTimestampToleranceSeconds,
    )
  ) {
    return { ok: false, reason: "stale_provider_timestamp" };
  }

  const route = mapWebhookRoute(provider, rawEventType);
  if (!route) {
    return { ok: false, reason: "unsupported_event_type" };
  }

  return {
    ok: true,
    envelope: {
      provider,
      eventId,
      eventCategory: route.eventCategory,
      routeCode: route.routeCode,
      receivedAt,
      ...(providerTimestamp === undefined ? {} : { providerTimestamp }),
    },
  };
}

export function decideWebhookIdempotency(
  existing: ExistingWebhookRecord | null,
  now?: string,
  deliverySource: "provider" | "queue" = "provider",
): WebhookIdempotencyDecision {
  if (!existing) {
    return { action: "process", reason: "first_seen" };
  }

  if (existing.status === "processed") {
    return { action: "skip", reason: "duplicate_processed" };
  }

  if (existing.status === "processing") {
    if (existing.processingExpiresAt && now && isAtOrBefore(existing.processingExpiresAt, now)) {
      return { action: "retry", reason: "stale_processing" };
    }
    return { action: "skip", reason: "duplicate_processing" };
  }

  if (existing.retryable) {
    if (existing.retryOwner === "queue" && deliverySource !== "queue") {
      return { action: "skip", reason: "queue_owned_retry" };
    }
    if (
      existing.nextAttemptAfter &&
      now &&
      deliverySource !== "queue" &&
      isAfter(existing.nextAttemptAfter, now)
    ) {
      return { action: "retry_later", reason: "prior_retry_not_due" };
    }
    return { action: "retry", reason: "prior_retryable_failure" };
  }

  return { action: "skip", reason: "prior_terminal_failure" };
}

export function createWebhookQueueMessage(input: {
  envelope: VerifiedWebhookEnvelope;
  attempt: number;
  notBefore?: string;
}): WebhookQueueMessage {
  const message = {
    provider: input.envelope.provider,
    eventId: input.envelope.eventId,
    eventCategory: input.envelope.eventCategory,
    routeCode: input.envelope.routeCode,
    receivedAt: input.envelope.receivedAt,
    ...(input.notBefore === undefined ? {} : { notBefore: input.notBefore }),
    attempt: input.attempt,
    correlationId: `${input.envelope.provider}:${input.envelope.eventId}`,
  };
  if (!isWebhookQueueMessagePhiSafe(message)) {
    throw new Error("Webhook queue message failed PHI safety validation");
  }
  if (JSON.stringify(message).length > maxWebhookQueueMessageBytes) {
    throw new Error("Webhook queue message exceeded safety size limit");
  }
  return message;
}

export function isWebhookQueueMessagePhiSafe(message: WebhookQueueMessage): boolean {
  const serialized = JSON.stringify(message);
  return !unsafeQueueFragments.some((fragment) => fragment.test(serialized));
}

export async function processVerifiedWebhook(input: {
  envelope: VerifiedWebhookEnvelope;
  repository: WebhookProcessingRepository;
  now: string;
  handler: (envelope: VerifiedWebhookEnvelope) => Promise<WebhookHandlerResult>;
  enqueue?: (message: WebhookQueueMessage) => Promise<void>;
  deliverySource?: "provider" | "queue";
  queueMessageAttempt?: number;
  processingLeaseSeconds?: number;
  retryBackoffSeconds?: number;
  maxAttempts?: number;
  clock?: () => string;
}): Promise<ProcessVerifiedWebhookResult> {
  const retryBackoffSeconds = input.retryBackoffSeconds ?? 300;
  const maxAttempts = input.maxAttempts ?? 3;
  const deliverySource = input.deliverySource ?? "provider";
  const claim = await input.repository.claim({
    provider: input.envelope.provider,
    eventId: input.envelope.eventId,
    now: input.now,
    deliverySource,
    expectedAttempts: deliverySource === "queue" ? input.queueMessageAttempt : undefined,
    processingLeaseSeconds: input.processingLeaseSeconds,
    maxAttempts,
  });

  if (claim.outcome === "alreadyProcessed") {
    return { status: "accepted", action: "skipped" };
  }
  if (claim.outcome === "alreadyProcessing") {
    return { status: "retry", reason: "already_processing" };
  }
  if (claim.outcome === "queueOwnedRetry") {
    return { status: "accepted", action: "skipped" };
  }
  if (claim.outcome === "staleQueueDelivery") {
    return { status: "accepted", action: "skipped" };
  }
  if (claim.outcome === "retryNotDue") {
    return { status: "retry", reason: "retry_not_due" };
  }
  if (claim.outcome === "retryExhausted") {
    if (deliverySource === "queue") {
      return { status: "retry", reason: "queue_retry_exhausted" };
    }
    return { status: "accepted", action: "terminal_failed" };
  }
  if (claim.outcome === "conflict") {
    if (deliverySource === "queue") {
      return { status: "retry", reason: "queue_retry_exhausted" };
    }
    return { status: "accepted", action: "terminal_failed" };
  }

  let handled: WebhookHandlerResult;
  try {
    handled = await input.handler(input.envelope);
  } catch {
    handled = {
      outcome: "failed",
      retryable: true,
      durableRetry: true,
      nextAttemptAfter: addSecondsIso(input.clock?.() ?? new Date().toISOString(), retryBackoffSeconds),
      maxAttempts,
    };
  }

  const completedAt = input.clock?.() ?? new Date().toISOString();

  if (handled.outcome === "processed") {
    await input.repository.markProcessed({
      provider: input.envelope.provider,
      eventId: input.envelope.eventId,
      now: completedAt,
      expectedAttempts: claim.record.attempts,
      expectedProcessingExpiresAt: claim.record.processingExpiresAt,
    });
    return { status: "accepted", action: "processed" };
  }

  if (!handled.retryable) {
    await input.repository.markFailed({
      provider: input.envelope.provider,
      eventId: input.envelope.eventId,
      retryable: false,
      now: completedAt,
      expectedAttempts: claim.record.attempts,
      expectedProcessingExpiresAt: claim.record.processingExpiresAt,
    });
    return { status: "accepted", action: "terminal_failed" };
  }

  if (deliverySource === "queue") {
    await input.repository.markFailed({
      provider: input.envelope.provider,
      eventId: input.envelope.eventId,
      retryable: true,
      now: completedAt,
      expectedAttempts: claim.record.attempts,
      expectedProcessingExpiresAt: claim.record.processingExpiresAt,
      retryOwner: "queue",
      nextAttemptAfter: handled.nextAttemptAfter ?? addSecondsIso(completedAt, retryBackoffSeconds),
      maxAttempts: handled.maxAttempts ?? maxAttempts,
    });
    return { status: "retry", reason: "handler_retryable_failure" };
  }

  if (handled.durableRetry && input.enqueue) {
    const nextAttemptAfter = handled.nextAttemptAfter ?? addSecondsIso(completedAt, retryBackoffSeconds);
    await input.repository.markFailed({
      provider: input.envelope.provider,
      eventId: input.envelope.eventId,
      retryable: true,
      now: completedAt,
      expectedAttempts: claim.record.attempts,
      expectedProcessingExpiresAt: claim.record.processingExpiresAt,
      retryOwner: "handoff",
      nextAttemptAfter,
      maxAttempts: handled.maxAttempts ?? maxAttempts,
    });
    try {
      await input.enqueue(createWebhookQueueMessage({
        envelope: input.envelope,
        attempt: claim.record.attempts,
        notBefore: nextAttemptAfter,
      }));
    } catch {
      await input.repository.markFailed({
        provider: input.envelope.provider,
        eventId: input.envelope.eventId,
        retryable: true,
        now: input.clock?.() ?? new Date().toISOString(),
        expectedAttempts: claim.record.attempts,
        retryOwner: "provider",
        nextAttemptAfter,
        maxAttempts: handled.maxAttempts ?? maxAttempts,
      });
      return { status: "retry", reason: "queue_send_failed" };
    }
    try {
      await input.repository.markFailed({
        provider: input.envelope.provider,
        eventId: input.envelope.eventId,
        retryable: true,
        now: input.clock?.() ?? new Date().toISOString(),
        expectedAttempts: claim.record.attempts,
        retryOwner: "queue",
        nextAttemptAfter,
        maxAttempts: handled.maxAttempts ?? maxAttempts,
      });
    } catch {
      return { status: "retry", reason: "queue_owner_mark_failed" };
    }
    return { status: "accepted", action: "queued" };
  }

  await input.repository.markFailed({
    provider: input.envelope.provider,
    eventId: input.envelope.eventId,
    retryable: true,
    now: completedAt,
    expectedAttempts: claim.record.attempts,
    expectedProcessingExpiresAt: claim.record.processingExpiresAt,
    retryOwner: "provider",
    nextAttemptAfter: handled.nextAttemptAfter ?? addSecondsIso(completedAt, retryBackoffSeconds),
    maxAttempts: handled.maxAttempts ?? maxAttempts,
  });
  return { status: "retry", reason: "handler_retryable_failure" };
}

function parseSignatureHeader(
  provider: WebhookProvider,
  signatureHeader: string,
): { signature: string; timestamp?: string } | null {
  if (signatureHeader.length > maxWebhookSignatureHeaderLength) {
    return null;
  }

  if (provider === "stripe") {
    const parts = new Map<string, string>();
    for (const part of signatureHeader.split(",")) {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex !== part.lastIndexOf("=")) {
        return null;
      }
      parts.set(part.slice(0, separatorIndex), part.slice(separatorIndex + 1));
    }
    const timestamp = parts.get("t");
    const signature = parts.get("v1");

    if (timestamp === undefined || signature === undefined || !isSha256HexSignature(signature)) {
      return null;
    }

    return { signature, timestamp };
  }

  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  return isSha256HexSignature(signature) ? { signature } : null;
}

function parseJsonPayload(payload: string | Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload.toString());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function extractProviderTimestamp(payload: Record<string, unknown>) {
  const value = extractString(payload, [
    "created_at",
    "occurred_at",
    "createdAt",
    "occurredAt",
  ]);
  if (value) {
    return value;
  }

  const created = payload.created;
  if (typeof created === "number" && Number.isFinite(created)) {
    return new Date(created * 1000).toISOString();
  }

  return undefined;
}

function mapWebhookRoute(
  provider: WebhookProvider,
  rawEventType: string,
): { eventCategory: WebhookEventCategory; routeCode: WebhookRouteCode } | null {
  if (provider === "stripe") {
    if (stripeBillingEvents.has(rawEventType)) {
      return { eventCategory: "billing", routeCode: "stripe.billing" };
    }
    if (stripeIdentityEvents.has(rawEventType)) {
      return { eventCategory: "identity", routeCode: "stripe.identity" };
    }
    return null;
  }

  if (mdiCaseEvents.has(rawEventType)) {
    return { eventCategory: "case", routeCode: "mdi.case" };
  }
  if (mdiPatientEvents.has(rawEventType)) {
    return { eventCategory: "patient", routeCode: "mdi.patient" };
  }
  return null;
}

function isAllowedWebhookEventId(provider: WebhookProvider, eventId: string) {
  if (eventId.length > maxWebhookEventIdLength) {
    return false;
  }
  const hasAllowedShape = provider === "stripe"
    ? /^evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(eventId)
    : /^mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(eventId);
  return hasAllowedShape && !unsafeWebhookIdentifierFragments.some((fragment) => fragment.test(eventId));
}

function isFreshUnixTimestamp(
  unixTimestamp: string | undefined,
  nowIso: string,
  toleranceSeconds: number,
) {
  if (!unixTimestamp || !/^\d+$/.test(unixTimestamp)) {
    return false;
  }
  const signedAt = Number(unixTimestamp) * 1000;
  const now = Date.parse(nowIso);
  return Number.isFinite(signedAt) &&
    Number.isFinite(now) &&
    Math.abs(now - signedAt) <= toleranceSeconds * 1000;
}

function isFreshIsoTimestamp(
  timestamp: string,
  nowIso: string,
  pastToleranceSeconds: number,
  futureToleranceSeconds: number,
) {
  const signedAt = Date.parse(timestamp);
  const now = Date.parse(nowIso);
  const ageMs = now - signedAt;
  return Number.isFinite(signedAt) &&
    Number.isFinite(now) &&
    ageMs <= pastToleranceSeconds * 1000 &&
    ageMs >= -futureToleranceSeconds * 1000;
}

function isAtOrBefore(leftIso: string, rightIso: string) {
  return compareIso(leftIso, rightIso, (left, right) => left <= right);
}

function isAfter(leftIso: string, rightIso: string) {
  return compareIso(leftIso, rightIso, (left, right) => left > right);
}

function compareIso(
  leftIso: string,
  rightIso: string,
  compare: (left: number, right: number) => boolean,
) {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  return Number.isFinite(left) && Number.isFinite(right) && compare(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addSecondsIso(isoTimestamp: string, seconds: number) {
  return new Date(Date.parse(isoTimestamp) + seconds * 1000).toISOString();
}

function timingSafeHexEqual(expectedHex: string, actualHex: string) {
  if (!isSha256HexSignature(actualHex)) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function isUsableWebhookSecret(secret: string) {
  return secret.trim().length > 0;
}

function isSha256HexSignature(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function webhookPayloadByteLength(payload: string | Buffer) {
  return typeof payload === "string" ? Buffer.byteLength(payload) : payload.byteLength;
}

const stripeBillingEvents = new Set([
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "payment_method.attached",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
  "payment_intent.payment_failed",
]);

const stripeIdentityEvents = new Set([
  "identity.verification_session.verified",
  "identity.verification_session.requires_input",
]);

const mdiCaseEvents = new Set([
  "case.created",
  "case.updated",
  "case.approved",
  "case.rejected",
  "case.closed",
  "case_created",
  "case_clinically_approved",
  "case_processing",
  "case_waiting",
  "case_completed",
  "case_cancelled",
  "case_transferred_to_support",
  "case_assigned_to_clinician",
  "message_created",
  "prescription_submitted",
  "voucher_used",
]);

const mdiPatientEvents = new Set([
  "patient.created",
  "patient.updated",
  "patient_modified",
  "patient_deleted",
]);

const unsafeQueueFragments = [
  /@/,
  /\d{1,3}(?:\.\d{1,3}){3}/,
  /email|first[_-]?name|last[_-]?name|patient[_-]?email|phone|address|dob|birth|ssn/i,
  /questionnaire|question|answer|diagnosis|symptom|clinical|clinician|medication|condition|note/i,
  /chest[_-]?pain|shortness[_-]?of[_-]?breath|pregnan|allerg|dosage|dose|prescription/i,
  /asthma|blood|bmi|cancer|cardiac|cardio|cholesterol|diabetes|diabetic|disease|glucose/i,
  /health|hypertension|kidney|liver|migraine|nausea|obesity|pain|pancreatitis|pressure/i,
  /weight|hiv|opioid|substance|addiction|mental[_-]?health|depression|anxiety/i,
  /glp|peptide|semaglutide|tirzepatide|ozempic|wegovy|mounjaro|zepbound/i,
  /card|bank|payment_method_details|last4/i,
  /secret|token|authorization|bearer|api[_-]?key|header|url|body|payload|metadata|message|description/i,
  /whsec_|sk_(?:test|live)_|rk_(?:test|live)_/i,
];

const unsafeWebhookIdentifierFragments = unsafeQueueFragments;
const maxWebhookEventIdLength = 128;
const maxWebhookQueueMessageBytes = 4096;
const maxWebhookSignatureHeaderLength = 2048;
const maxWebhookPayloadBytes = 256 * 1024;
