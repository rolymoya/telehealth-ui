import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import {
  type AppDataError,
  type AppDataRepository,
  type AppDataResult,
  type EvidenceEventRecord,
  type MdiLinkageRecord,
  type OnboardingStatus,
  createWebhookEvidenceEventId,
  findPatientByMdiPointer,
  getMdiLinkage,
  mdiCaseReverseKey,
  mdiPatientReverseKey,
  recordEvidenceEvent,
  transitionOnboardingStatus,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  getMdiLinkageDynamoDb,
  recordEvidenceEventDynamoDb,
  transitionOnboardingStatusDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  canonicalMdiCaseId,
  canonicalMdiPatientId,
} from "@/lib/mdi/ids";
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
  | "submitted"
  | "clinical_review"
  | "billing_ready"
  | "cancelled";

export const mdiWebhookEventContracts = [
  { type: "case_created", handling: "inline", caseStatus: "submitted" },
  { type: "case_processing", handling: "inline", caseStatus: "clinical_review" },
  { type: "case_waiting", handling: "inline", caseStatus: "clinical_review" },
  { type: "case_transferred_to_support", handling: "inline", caseStatus: "clinical_review" },
  { type: "case_approved", handling: "inline", caseStatus: "billing_ready" },
  { type: "case_clinically_approved", handling: "inline", caseStatus: "billing_ready" },
  { type: "case_completed", handling: "inline", caseStatus: "billing_ready" },
  { type: "case_cancelled", handling: "inline", caseStatus: "cancelled" },
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
    async recordEvidenceEvent(input) {
      return recordEvidenceEvent(repository, input);
    },
    async transitionOnboardingStatus(input) {
      return transitionOnboardingStatus(repository, input);
    },
  };
}

export function createDynamoDbMdiWebhookMirrorRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite" | "update">,
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

  const target = onboardingTargetForMdiCaseStatus(input.webhook.contract.caseStatus);
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
    metadata: { side_effect: "mdi_status_update" },
    source: "webhook",
    status: "succeeded",
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    webhookEventId: input.webhook.eventId,
    webhookProvider: "mdi",
  });
  if (!evidence.ok) {
    return evidence.error.kind === "conditional_conflict"
      ? { outcome: "processed" as const }
      : appDataFailure(evidence.error);
  }

  return { outcome: "processed" as const };
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
    case "clinical_review":
      return "clinical_review";
    case "billing_ready":
      return "billing_ready";
    case "submitted":
    case "cancelled":
    case undefined:
      return null;
  }
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
