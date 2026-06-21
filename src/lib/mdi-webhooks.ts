import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import {
  type AppDataError,
  type AppDataKey,
  type AppDataRepository,
  type AppDataResult,
  type BillingStatus,
  type EvidenceEventRecord,
  type MdiLinkageRecord,
  type OnboardingStatus,
  type StripeLinkageRecord,
  createWebhookEvidenceEventId,
  findPatientByMdiPointer,
  getMdiLinkage,
  getStripeLinkage,
  listEvidenceEventsForMdiCase,
  mdiCaseReverseKey,
  mdiPatientReverseKey,
  recordEvidenceEvent,
  transitionOnboardingStatus,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  getMdiLinkageDynamoDb,
  getStripeLinkageDynamoDb,
  listEvidenceEventsForMdiCaseDynamoDb,
  recordEvidenceEventDynamoDb,
  transitionOnboardingStatusDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  canonicalMdiCaseId,
  canonicalMdiPatientId,
} from "@/lib/mdi/ids";
import {
  evaluateBillingUnlock,
  type BillingState,
} from "@/lib/payment-gating";
import type { MdiApiSecretPayload } from "@/lib/secrets/contracts";
import {
  type ProcessVerifiedWebhookResult,
  type VerifiedWebhookEnvelope,
  type WebhookProcessingRepository,
  processVerifiedWebhook,
  verifyWebhookSignature,
} from "@/lib/webhooks";

export const maxMdiWebhookPayloadBytes = 64 * 1024;

export type MdiWebhookResult =
  | { ok: true; status: 200; body: { received: true; action: "processed" | "skipped" | "queued" | "terminal_failed" } }
  | { ok: false; status: 400; body: { error: "invalid_signature" | "invalid_payload" } }
  | { ok: false; status: 409; body: { error: "retry_later" } }
  | { ok: false; status: 500; body: { error: "webhook_processing_failed" } };

export type MdiWebhookEventHandling = "inline" | "terminal";

export type MdiWebhookEventContract = {
  type: string;
  handling: MdiWebhookEventHandling;
  caseStatus?: MdiWebhookCaseStatus;
};

export type MdiWebhookCaseStatus =
  | "assigned"
  | "billing_ready"
  | "cancelled"
  | "clinical_review"
  | "completed"
  | "created"
  | "declined"
  | "processing"
  | "support"
  | "tagged"
  | "waiting";

export const mdiWebhookEventContracts = [
  { type: "case_created", handling: "inline", caseStatus: "created" },
  { type: "case_processing", handling: "inline", caseStatus: "processing" },
  { type: "case_waiting", handling: "inline", caseStatus: "waiting" },
  { type: "case_support", handling: "inline", caseStatus: "support" },
  { type: "case_assigned", handling: "inline", caseStatus: "assigned" },
  { type: "case_tag_added", handling: "inline", caseStatus: "tagged" },
  { type: "case_transferred_to_support", handling: "inline", caseStatus: "support" },
  { type: "case_approved", handling: "inline", caseStatus: "billing_ready" },
  { type: "case_clinically_approved", handling: "inline", caseStatus: "billing_ready" },
  { type: "case_completed", handling: "inline", caseStatus: "completed" },
  { type: "case_cancelled", handling: "inline", caseStatus: "cancelled" },
  { type: "case_declined", handling: "inline", caseStatus: "declined" },
  { type: "case_file_added", handling: "terminal" },
  { type: "case_file_deleted", handling: "terminal" },
  { type: "medical_necessity_file_generated", handling: "terminal" },
  { type: "file_lab_results_processed", handling: "terminal" },
  { type: "case_assigned_to_clinician", handling: "terminal" },
  { type: "clinical_note_created", handling: "terminal" },
  { type: "case_tag_attached", handling: "terminal" },
  { type: "partner_charge", handling: "terminal" },
  { type: "offering_submitted", handling: "terminal" },
  { type: "prescription_insurance_coverage_updated", handling: "terminal" },
  { type: "order_status_changed", handling: "terminal" },
  { type: "order_tracking_number_changed", handling: "terminal" },
  { type: "voucher_created", handling: "terminal" },
  { type: "voucher_updated", handling: "terminal" },
  { type: "voucher_used", handling: "terminal" },
  { type: "voucher_reminder_sent", handling: "terminal" },
  { type: "voucher_expired", handling: "terminal" },
  { type: "drivers_license_requested", handling: "terminal" },
  { type: "intro_video_requested", handling: "terminal" },
  { type: "file_upload_requested", handling: "terminal" },
  { type: "exam_requested", handling: "terminal" },
  { type: "preferred_pharmacy_requested", handling: "terminal" },
  { type: "patient_tag_attached", handling: "terminal" },
  { type: "patient_created", handling: "terminal" },
  { type: "patient_deleted", handling: "terminal" },
  { type: "patient_modified", handling: "terminal" },
  { type: "patient_opt_out", handling: "terminal" },
  { type: "patient_insurance_coverage_updated", handling: "terminal" },
  { type: "message_created", handling: "terminal" },
  { type: "notification_sent", handling: "terminal" },
] as const satisfies readonly MdiWebhookEventContract[];

export type MdiWebhookMirrorRepository = {
  findPatientByMdiCase(mdiCaseId: string): Promise<AppDataResult<string | null>>;
  findPatientByMdiPatient(mdiPatientId: string): Promise<AppDataResult<string | null>>;
  getMdiLinkage(cognitoSub: string): Promise<AppDataResult<MdiLinkageRecord | null>>;
  getStripeLinkage(cognitoSub: string): Promise<AppDataResult<StripeLinkageRecord | null>>;
  listEvidenceEventsForMdiCase(input: {
    cognitoSub: string;
    mdiCaseId: string;
    limit?: number;
  }): Promise<AppDataResult<EvidenceEventRecord[]>>;
  recordEvidenceEvent(
    input: Parameters<typeof recordEvidenceEvent>[1],
  ): Promise<AppDataResult<EvidenceEventRecord>>;
  transitionOnboardingStatus(input: {
    cognitoSub: string;
    expected: OnboardingStatus;
    next: OnboardingStatus;
    now: string;
  }): Promise<AppDataResult<unknown>>;
};

export type HandleMdiWebhookInput = {
  authorization: string;
  mdiMirrorRepository: MdiWebhookMirrorRepository;
  payload: string | Buffer;
  receivedAt: string;
  secret: Pick<
    MdiApiSecretPayload,
    | "webhookAuthorizationSecret"
    | "webhookSigningSecret"
    | "webhookSigningSecretPrevious"
    | "webhookSigningSecretPreviousExpiresAt"
  >;
  signature: string;
  webhookRepository: WebhookProcessingRepository;
};

type NormalizedMdiWebhook = {
  caseId?: string;
  contract: MdiWebhookEventContract;
  eventId: string;
  eventType: string;
  patientId?: string;
  providerTimestamp: string;
};

export function createInMemoryMdiWebhookMirrorRepository(
  repository: AppDataRepository,
): MdiWebhookMirrorRepository {
  return {
    async findPatientByMdiCase(mdiCaseId) {
      return findPatientByMdiPointer(repository, { pointerType: "case", mdiCaseId });
    },
    async findPatientByMdiPatient(mdiPatientId) {
      return findPatientByMdiPointer(repository, { pointerType: "patient", mdiPatientId });
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkage(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkage(repository, cognitoSub);
    },
    async listEvidenceEventsForMdiCase(input) {
      const items: EvidenceEventRecord[] = [];
      let exclusiveStartKey: AppDataKey | undefined;
      do {
        const result = listEvidenceEventsForMdiCase(repository, {
          ...input,
          exclusiveStartKey,
          limit: input.limit ?? 100,
        });
        if (!result.ok) {
          return result;
        }
        if (result.value) {
          items.push(...result.value.items);
          exclusiveStartKey = result.value.nextKey;
        } else {
          exclusiveStartKey = undefined;
        }
      } while (exclusiveStartKey);
      return { ok: true, value: items };
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEvent(repository, input);
    },
    async transitionOnboardingStatus(input) {
      return transitionOnboardingStatus(repository, input);
    },
  };
}

export function createDynamoDbMdiWebhookMirrorRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "queryByKeyPrefix" | "transactWrite" | "update">,
): MdiWebhookMirrorRepository {
  return {
    async findPatientByMdiCase(mdiCaseId) {
      return findPatientByMdiPointerDynamoDb(repository, { pointerType: "case", mdiCaseId });
    },
    async findPatientByMdiPatient(mdiPatientId) {
      return findPatientByMdiPointerDynamoDb(repository, { pointerType: "patient", mdiPatientId });
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkageDynamoDb(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkageDynamoDb(repository, cognitoSub);
    },
    async listEvidenceEventsForMdiCase(input) {
      return listEvidenceEventsForMdiCaseDynamoDb(repository, input);
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEventDynamoDb(repository, input);
    },
    async transitionOnboardingStatus(input) {
      return transitionOnboardingStatusDynamoDb(repository, input);
    },
  };
}

export async function handleMdiWebhook(input: HandleMdiWebhookInput): Promise<MdiWebhookResult> {
  if (webhookPayloadByteLength(input.payload) > maxMdiWebhookPayloadBytes) {
    return { ok: false, status: 400, body: { error: "invalid_signature" } };
  }
  if (!verifyMdiAuthorization(input.authorization, input.secret.webhookAuthorizationSecret)) {
    return { ok: false, status: 400, body: { error: "invalid_signature" } };
  }
  if (!verifyMdiWebhookSignature(input)) {
    return { ok: false, status: 400, body: { error: "invalid_signature" } };
  }

  const normalized = normalizeMdiWebhookPayload({
    payload: input.payload,
    receivedAt: input.receivedAt,
  });
  if (!normalized.ok) {
    return { ok: false, status: 400, body: { error: "invalid_payload" } };
  }

  const envelope: VerifiedWebhookEnvelope = {
    provider: "mdi",
    eventId: normalized.value.eventId,
    eventCategory: normalized.value.caseId ? "case" : "patient",
    routeCode: normalized.value.caseId ? "mdi.case" : "mdi.patient",
    receivedAt: input.receivedAt,
    providerTimestamp: normalized.value.providerTimestamp,
  };

  let processed: ProcessVerifiedWebhookResult;
  try {
    processed = await processVerifiedWebhook({
      envelope,
      repository: input.webhookRepository,
      handler: async () => handleVerifiedMdiEvent({
        mdiMirrorRepository: input.mdiMirrorRepository,
        now: input.receivedAt,
        webhook: normalized.value,
      }),
      clock: () => input.receivedAt,
      maxAttempts: maxMdiProviderRetryAttempts,
    });
  } catch {
    return { ok: false, status: 500, body: { error: "webhook_processing_failed" } };
  }

  return resultForProcessedWebhook(processed);
}

function verifyMdiWebhookSignature(input: Pick<
  HandleMdiWebhookInput,
  "payload" | "receivedAt" | "secret" | "signature"
>) {
  if (
    verifyWebhookSignature({
      provider: "mdi",
      payload: input.payload,
      secret: input.secret.webhookSigningSecret,
      signatureHeader: input.signature,
    })
  ) {
    return true;
  }
  if (
    input.secret.webhookSigningSecretPrevious &&
    input.secret.webhookSigningSecretPreviousExpiresAt &&
    !isAfter(input.receivedAt, input.secret.webhookSigningSecretPreviousExpiresAt)
  ) {
    return verifyWebhookSignature({
      provider: "mdi",
      payload: input.payload,
      secret: input.secret.webhookSigningSecretPrevious,
      signatureHeader: input.signature,
    });
  }
  return false;
}

function normalizeMdiWebhookPayload(input: {
  payload: string | Buffer;
  receivedAt: string;
}): { ok: true; value: NormalizedMdiWebhook } | { ok: false } {
  const parsed = parseJsonPayload(input.payload);
  if (!parsed) {
    return opaquePreferredPharmacyRequestedWebhook(input);
  }

  const eventType = stringField(parsed, "event_type");
  if (!eventType) {
    return opaquePreferredPharmacyRequestedWebhook(input);
  }
  const timestamp = numericTimestampToIso(parsed.timestamp);
  if (!timestamp || !isFreshIsoTimestamp(timestamp, input.receivedAt)) {
    return { ok: false };
  }

  const contract = mdiWebhookEventContracts.find((candidate) => candidate.type === eventType);
  if (!contract) {
    return { ok: false };
  }

  const rawCaseId = stringField(parsed, "case_id");
  const rawPatientId = stringField(parsed, "patient_id");
  const caseId = rawCaseId === undefined ? undefined : canonicalMdiCaseId(rawCaseId);
  const patientId = rawPatientId === undefined ? undefined : canonicalMdiPatientId(rawPatientId);
  if ((rawCaseId !== undefined && caseId === null) || (rawPatientId !== undefined && patientId === null)) {
    return { ok: false };
  }
  if (contract.handling === "inline" && caseId === undefined) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      caseId: caseId ?? undefined,
      contract,
      eventId: createDeterministicMdiEventId({
        caseId: caseId ?? undefined,
        eventType,
        patientId: patientId ?? undefined,
        timestamp,
      }),
      eventType,
      patientId: patientId ?? undefined,
      providerTimestamp: timestamp,
    },
  };
}

function opaquePreferredPharmacyRequestedWebhook(input: {
  payload: string | Buffer;
  receivedAt: string;
}): { ok: true; value: NormalizedMdiWebhook } {
  const eventType = "preferred_pharmacy_requested";
  const contract = mdiWebhookEventContracts.find((candidate) => candidate.type === eventType);
  if (!contract) {
    throw new Error("Missing MDI preferred pharmacy webhook contract");
  }

  return {
    ok: true,
    value: {
      contract,
      eventId: createDeterministicMdiEventId({
        eventType,
        payloadDigest: sha256Payload(input.payload),
      }),
      eventType,
      providerTimestamp: input.receivedAt,
    },
  };
}

async function handleVerifiedMdiEvent(input: {
  mdiMirrorRepository: MdiWebhookMirrorRepository;
  now: string;
  webhook: NormalizedMdiWebhook;
}) {
  if (input.webhook.contract.handling === "terminal") {
    return { outcome: "processed" as const };
  }

  const caseId = input.webhook.caseId;
  if (!caseId) {
    return { outcome: "failed" as const, retryable: false, durableRetry: false };
  }

  const patient = await input.mdiMirrorRepository.findPatientByMdiCase(caseId);
  if (!patient.ok) {
    return appDataFailure(patient.error);
  }
  if (!patient.value) {
    return { outcome: "processed" as const };
  }

  const linkage = await input.mdiMirrorRepository.getMdiLinkage(patient.value);
  if (!linkage.ok) {
    return appDataFailure(linkage.error);
  }
  if (!linkage.value || linkage.value.mdiCaseId !== caseId) {
    return {
      outcome: "failed" as const,
      retryable: true,
      durableRetry: false,
    };
  }

  const caseStatus = input.webhook.contract.caseStatus;
  if (!caseStatus) {
    return { outcome: "processed" as const };
  }

  const priorEvidence = await input.mdiMirrorRepository.listEvidenceEventsForMdiCase({
    cognitoSub: patient.value,
    mdiCaseId: caseId,
    limit: 100,
  });
  if (!priorEvidence.ok) {
    return appDataFailure(priorEvidence.error);
  }
  if (!isCurrentCaseLifecycleEvent({
    incoming: {
      occurredAt: input.webhook.providerTimestamp,
      status: caseStatus,
    },
    priorEvents: priorEvidence.value,
  })) {
    return { outcome: "processed" as const };
  }

  const target = onboardingTargetForMdiCaseStatus(caseStatus);
  if (target) {
    const transitioned = await applyOnboardingMirror(input.mdiMirrorRepository, {
      cognitoSub: patient.value,
      next: target,
      now: input.now,
    });
    if (!transitioned.ok) {
      return transitioned.retryable
        ? { outcome: "failed" as const, retryable: true, durableRetry: false }
        : { outcome: "failed" as const, retryable: false, durableRetry: false };
    }
  }

  const evidence = await input.mdiMirrorRepository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: patient.value,
    eventCategory: "webhook",
    eventId: createWebhookEvidenceEventId(
      "mdi",
      input.webhook.eventId,
      "WEBHOOK_SIDE_EFFECT_APPLIED",
      "mdi_status_update",
    ),
    eventType: "webhook_side_effect_applied",
    occurredAt: input.webhook.providerTimestamp,
    recordedAt: input.now,
    mdiCaseId: caseId,
    mdiPatientId: linkage.value.mdiPatientId,
    metadata: { case_status: caseStatus, side_effect: "mdi_status_update" },
    source: "webhook",
    status: "succeeded",
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    webhookEventId: input.webhook.eventId,
    webhookProvider: "mdi",
  });
  if (!evidence.ok) {
    if (evidence.error.kind !== "conditional_conflict") {
      return appDataFailure(evidence.error);
    }
  }

  const billing = await recordBillingUnlockDecision(input.mdiMirrorRepository, {
    caseId,
    cognitoSub: patient.value,
    eventType: input.webhook.eventType,
    mdiPatientId: linkage.value.mdiPatientId,
    now: input.now,
    providerTimestamp: input.webhook.providerTimestamp,
    webhookEventId: input.webhook.eventId,
  });
  if (!billing.ok) {
    return billing.retryable
      ? { outcome: "failed" as const, retryable: true, durableRetry: false }
      : { outcome: "failed" as const, retryable: false, durableRetry: false };
  }

  return { outcome: "processed" as const };
}

async function recordBillingUnlockDecision(
  repository: MdiWebhookMirrorRepository,
  input: {
    caseId: string;
    cognitoSub: string;
    eventType: string;
    mdiPatientId: string;
    now: string;
    providerTimestamp: string;
    webhookEventId: string;
  },
): Promise<{ ok: true } | { ok: false; retryable: boolean }> {
  const stripe = await repository.getStripeLinkage(input.cognitoSub);
  if (!stripe.ok) {
    return { ok: false, retryable: stripe.error.kind !== "validation_failed" };
  }

  const decision = evaluateBillingUnlock({
    billingState: billingStateForStripeStatus(stripe.value?.billingStatus),
    event: {
      provider: "mdi",
      type: input.eventType,
      mdiCaseId: input.caseId,
    },
    expectedMdiCaseId: input.caseId,
  });
  const eventId = mdiBillingUnlockDecisionEventId({
    action: decision.action,
    caseId: input.caseId,
    webhookEventId: input.webhookEventId,
  });
  const evidence = await repository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: input.cognitoSub,
    eventCategory: "mdi_handoff",
    eventId,
    eventType: "mdi_billing_unlock_decision",
    occurredAt: input.providerTimestamp,
    recordedAt: input.now,
    mdiCaseId: input.caseId,
    mdiPatientId: input.mdiPatientId,
    metadata: {
      billing_action: decision.action,
      billing_reason: decision.reason,
    },
    source: "webhook",
    status: decision.canActivate ? "recorded" : "skipped",
    summaryCode: "MDI_BILLING_UNLOCK_DECISION",
  });
  if (evidence.ok || evidence.error.kind === "conditional_conflict") {
    return { ok: true };
  }
  return {
    ok: false,
    retryable: evidence.error.kind !== "validation_failed",
  };
}

async function applyOnboardingMirror(
  repository: MdiWebhookMirrorRepository,
  input: { cognitoSub: string; next: OnboardingStatus; now: string },
): Promise<{ ok: true } | { ok: false; retryable: boolean }> {
  const expectedStatuses: OnboardingStatus[] = input.next === "billing_ready"
    ? ["clinical_review", "mdi_submitted"]
    : ["mdi_submitted"];

  for (const expected of expectedStatuses) {
    const transitioned = await repository.transitionOnboardingStatus({
      cognitoSub: input.cognitoSub,
      expected,
      next: input.next,
      now: input.now,
    });
    if (transitioned.ok) {
      return { ok: true };
    }
    if (transitioned.error.kind !== "stale_transition") {
      return {
        ok: false,
        retryable: transitioned.error.kind !== "validation_failed",
      };
    }
  }

  return { ok: true };
}

async function findPatientByMdiPointerDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  pointer:
    | { pointerType: "case"; mdiCaseId: string }
    | { pointerType: "patient"; mdiPatientId: string },
): Promise<AppDataResult<string | null>> {
  const record = await repository.get(pointer.pointerType === "case"
    ? mdiCaseReverseKey(pointer.mdiCaseId)
    : mdiPatientReverseKey(pointer.mdiPatientId));
  if (!record.ok) {
    return record;
  }
  if (!record.value) {
    return { ok: true, value: null };
  }
  return record.value.recordType === "mdiReverseLookup"
    ? { ok: true, value: record.value.cognitoSub }
    : {
      ok: false,
      error: {
        kind: "validation_failed",
        message: "MDI reverse key contains another record type",
      },
    };
}

function onboardingTargetForMdiCaseStatus(
  status: MdiWebhookCaseStatus | undefined,
): OnboardingStatus | null {
  switch (status) {
    case "assigned":
    case "clinical_review":
    case "processing":
    case "support":
    case "tagged":
    case "waiting":
      return "clinical_review";
    case "billing_ready":
    case "completed":
      return "billing_ready";
    case "cancelled":
    case "created":
    case "declined":
    case undefined:
      return null;
  }
}

function isCurrentCaseLifecycleEvent(input: {
  incoming: {
    occurredAt: string;
    status: MdiWebhookCaseStatus;
  };
  priorEvents: readonly EvidenceEventRecord[];
}) {
  const latest = latestCaseStatusEvidence(input.priorEvents);
  if (!latest) {
    return true;
  }

  const incomingTime = Date.parse(input.incoming.occurredAt);
  const latestTime = Date.parse(latest.occurredAt);
  if (!Number.isFinite(incomingTime) || !Number.isFinite(latestTime)) {
    return false;
  }
  if (incomingTime < latestTime) {
    return false;
  }
  if (isTerminalCaseStatus(latest.status) && !isTerminalCaseStatus(input.incoming.status)) {
    return false;
  }

  const incomingRank = caseStatusRank(input.incoming.status);
  const latestRank = caseStatusRank(latest.status);
  if (incomingTime === latestTime && incomingRank < latestRank) {
    return false;
  }
  return !(
    latestRank >= caseStatusRank("billing_ready") &&
    incomingRank < latestRank &&
    !isTerminalCaseStatus(input.incoming.status)
  );
}

function latestCaseStatusEvidence(events: readonly EvidenceEventRecord[]) {
  let latest: { occurredAt: string; status: MdiWebhookCaseStatus } | null = null;
  for (const event of events) {
    const status = event.metadata?.case_status;
    if (
      event.eventType !== "webhook_side_effect_applied" ||
      event.metadata?.side_effect !== "mdi_status_update" ||
      !isMdiWebhookCaseStatus(status)
    ) {
      continue;
    }

    const eventTime = Date.parse(event.occurredAt);
    const latestTime = latest === null ? Number.NEGATIVE_INFINITY : Date.parse(latest.occurredAt);
    if (!Number.isFinite(eventTime)) {
      continue;
    }
    if (
      !latest ||
      eventTime > latestTime ||
      (eventTime === latestTime && caseStatusRank(status) > caseStatusRank(latest.status))
    ) {
      latest = {
        occurredAt: event.occurredAt,
        status,
      };
    }
  }
  return latest;
}

function isMdiWebhookCaseStatus(value: unknown): value is MdiWebhookCaseStatus {
  return typeof value === "string" && mdiWebhookCaseStatuses.has(value as MdiWebhookCaseStatus);
}

function isTerminalCaseStatus(status: MdiWebhookCaseStatus) {
  return status === "cancelled" || status === "declined";
}

function caseStatusRank(status: MdiWebhookCaseStatus) {
  return caseStatusRanks[status];
}

function billingStateForStripeStatus(status: BillingStatus | undefined): BillingState {
  if (status === "payment_method_collected") {
    return "payment_method_collected";
  }
  if (status === "active") {
    return "subscription_active";
  }
  return "payment_method_pending";
}

function mdiBillingUnlockDecisionEventId(input: {
  action: string;
  caseId: string;
  webhookEventId: string;
}) {
  return input.action === "activate_billing"
    ? `mdi:billing_unlock:${input.caseId}:activate_billing`
    : `mdi:billing_unlock:${input.caseId}:${input.action}:${input.webhookEventId}`;
}

function resultForProcessedWebhook(processed: ProcessVerifiedWebhookResult): MdiWebhookResult {
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

function verifyMdiAuthorization(header: string, secret: string) {
  if (!secret.trim() || header.length > maxMdiAuthorizationHeaderLength) {
    return false;
  }
  const trimmed = header.trim();
  return timingSafeStringEqual(trimmed, secret.trim()) ||
    timingSafeStringEqual(trimmed, `Bearer ${secret.trim()}`);
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseJsonPayload(payload: string | Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload.toString());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numericTimestampToIso(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isFreshIsoTimestamp(
  timestamp: string,
  nowIso: string,
  pastToleranceSeconds = 86_400,
  futureToleranceSeconds = 300,
) {
  const signedAt = Date.parse(timestamp);
  const now = Date.parse(nowIso);
  const ageMs = now - signedAt;
  return Number.isFinite(signedAt) &&
    Number.isFinite(now) &&
    ageMs <= pastToleranceSeconds * 1000 &&
    ageMs >= -futureToleranceSeconds * 1000;
}

function createDeterministicMdiEventId(input: {
  caseId?: string;
  eventType: string;
  patientId?: string;
  payloadDigest?: string;
  timestamp?: string;
}) {
  const digest = sha256([
    input.eventType,
    input.timestamp ?? "",
    input.caseId ?? "",
    input.patientId ?? "",
    input.payloadDigest ?? "",
  ].join("|")).slice(0, 48);
  return `mdi_evt_${digest}`;
}

function appDataFailure(error: AppDataError) {
  return {
    outcome: "failed" as const,
    retryable: error.kind !== "validation_failed",
    durableRetry: false,
  };
}

function webhookPayloadByteLength(payload: string | Buffer) {
  return typeof payload === "string" ? Buffer.byteLength(payload) : payload.byteLength;
}

function isAfter(leftIso: string, rightIso: string) {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  return Number.isFinite(left) && Number.isFinite(right) && left > right;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Payload(payload: string | Buffer) {
  return createHash("sha256").update(payload).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const maxMdiAuthorizationHeaderLength = 2048;
const maxMdiProviderRetryAttempts = 1_000_000;

const mdiWebhookCaseStatuses = new Set<MdiWebhookCaseStatus>([
  "assigned",
  "billing_ready",
  "cancelled",
  "clinical_review",
  "completed",
  "created",
  "declined",
  "processing",
  "support",
  "tagged",
  "waiting",
]);

const caseStatusRanks: Record<MdiWebhookCaseStatus, number> = {
  assigned: 20,
  billing_ready: 30,
  cancelled: 50,
  clinical_review: 20,
  completed: 40,
  created: 10,
  declined: 50,
  processing: 20,
  support: 20,
  tagged: 20,
  waiting: 20,
};
