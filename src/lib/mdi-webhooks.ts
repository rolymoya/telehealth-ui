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
  recordCurrentMdiCaseStatusEvidence,
  recordEvidenceEvent,
  transitionOnboardingStatus,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  getMdiLinkageDynamoDb,
  getStripeLinkageDynamoDb,
  listEvidenceEventsForMdiCaseDynamoDb,
  recordCurrentMdiCaseStatusEvidenceDynamoDb,
  recordEvidenceEventDynamoDb,
  transitionOnboardingStatusDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  canonicalMdiCaseId,
  canonicalMdiPatientId,
} from "@/lib/mdi/ids";
import {
  caseStatusRank,
  isMdiCaseStatus as isMdiWebhookCaseStatus,
  isTerminalMdiCaseStatus as isTerminalCaseStatus,
  onboardingTargetForMdiCaseStatus,
  type MdiCaseStatus,
} from "@/lib/mdi/case-status";
import {
  evaluateBillingUnlock,
  type BillingUnlockDecision,
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

export type MdiWebhookEventHandling = "charge" | "cue" | "inline" | "terminal";

export type MdiWebhookEventContract = {
  type: string;
  handling: MdiWebhookEventHandling;
  caseStatus?: MdiWebhookCaseStatus;
};

export type MdiWebhookCaseStatus = MdiCaseStatus;

export const mdiWebhookEventContracts = [
  { type: "case_created", handling: "inline", caseStatus: "created" },
  { type: "case_processing", handling: "inline", caseStatus: "processing" },
  { type: "case_waiting", handling: "inline", caseStatus: "waiting" },
  { type: "case_support", handling: "inline", caseStatus: "support" },
  { type: "case_assigned", handling: "inline", caseStatus: "assigned" },
  { type: "case_tag_added", handling: "inline", caseStatus: "tagged" },
  { type: "case_transferred_to_support", handling: "inline", caseStatus: "support" },
  { type: "case_approved", handling: "inline", caseStatus: "approved" },
  { type: "case_clinically_approved", handling: "inline", caseStatus: "billing_ready" },
  { type: "case_completed", handling: "inline", caseStatus: "completed" },
  { type: "case_cancelled", handling: "inline", caseStatus: "cancelled" },
  { type: "case_declined", handling: "inline", caseStatus: "declined" },
  { type: "case_file_added", handling: "cue" },
  { type: "case_file_deleted", handling: "cue" },
  { type: "medical_necessity_file_generated", handling: "terminal" },
  { type: "file_lab_results_processed", handling: "cue" },
  { type: "case_assigned_to_clinician", handling: "terminal" },
  { type: "clinical_note_created", handling: "terminal" },
  { type: "case_tag_attached", handling: "terminal" },
  { type: "partner_additional_charge", handling: "charge" },
  { type: "partner_charge", handling: "terminal" },
  { type: "vouched_amount_charge", handling: "charge" },
  { type: "offering_submitted", handling: "terminal" },
  { type: "prescription_insurance_coverage_updated", handling: "terminal" },
  { type: "order_status_changed", handling: "terminal" },
  { type: "order_tracking_number_changed", handling: "terminal" },
  { type: "voucher_created", handling: "cue" },
  { type: "voucher_updated", handling: "cue" },
  { type: "voucher_used", handling: "cue" },
  { type: "voucher_reminder_sent", handling: "cue" },
  { type: "voucher_expired", handling: "cue" },
  { type: "drivers_license_requested", handling: "terminal" },
  { type: "intro_video_requested", handling: "terminal" },
  { type: "file_upload_requested", handling: "cue" },
  { type: "exam_requested", handling: "cue" },
  { type: "preferred_pharmacy_requested", handling: "terminal" },
  { type: "patient_tag_attached", handling: "terminal" },
  { type: "patient_created", handling: "terminal" },
  { type: "patient_deleted", handling: "terminal" },
  { type: "patient_modified", handling: "terminal" },
  { type: "patient_opt_out", handling: "terminal" },
  { type: "patient_insurance_coverage_updated", handling: "terminal" },
  { type: "message_created", handling: "cue" },
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
  recordCurrentCaseStatusEvidence(
    input: Parameters<typeof recordCurrentMdiCaseStatusEvidence>[1],
  ): Promise<AppDataResult<{ applied: boolean; record: EvidenceEventRecord }>>;
  transitionOnboardingStatus(input: {
    cognitoSub: string;
    expected: OnboardingStatus;
    next: OnboardingStatus;
    now: string;
  }): Promise<AppDataResult<unknown>>;
};

export type HandleMdiWebhookInput = {
  authorization: string;
  billingActivation?: MdiBillingActivation;
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

export type MdiBillingActivation = {
  activate(input: {
    cognitoSub: string;
    mdiCaseId: string;
    now: string;
    webhookEventId: string;
  }): Promise<{ ok: true } | { ok: false; retryable: boolean }>;
  cancel(input: {
    cognitoSub: string;
    mdiCaseId: string;
    now: string;
    webhookEventId: string;
  }): Promise<{ ok: true } | { ok: false; retryable: boolean }>;
};

type NormalizedMdiWebhook = {
  caseId?: string;
  charge?: NormalizedMdiPartnerCharge;
  claimEventId?: string;
  contract: MdiWebhookEventContract;
  cuePointer?: string;
  eventId: string;
  eventType: string;
  patientId?: string;
  providerTimestamp: string;
};

type MdiPartnerChargeCode = "partner_additional_charge" | "vouched_amount_charge";

type NormalizedMdiPartnerCharge = {
  amountCents: number;
  chargeCode: MdiPartnerChargeCode;
  currency: "usd";
  fingerprint: string;
  referenceType?: "charge" | "voucher";
};

type MdiDashboardCueFamily = "exam" | "file" | "lab" | "message" | "voucher" | "workflow";
type MdiDashboardCueCode =
  | "benefit_status_pending"
  | "cue_noop"
  | "exam_action_needed"
  | "file_action_needed"
  | "files_unavailable"
  | "open_mdi_files"
  | "open_mdi_messages"
  | "ops_review_required";
type MdiDashboardCueAction =
  | "action_needed"
  | "noop"
  | "open_mdi"
  | "ops_review"
  | "status_available"
  | "status_unavailable";

type MdiDashboardCue = {
  action: MdiDashboardCueAction;
  code: MdiDashboardCueCode;
  family: MdiDashboardCueFamily;
  pointer: string;
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
    async recordCurrentCaseStatusEvidence(input) {
      return recordCurrentMdiCaseStatusEvidence(repository, input);
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
    async recordCurrentCaseStatusEvidence(input) {
      return recordCurrentMdiCaseStatusEvidenceDynamoDb(repository, input);
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
    eventId: normalized.value.claimEventId ?? normalized.value.eventId,
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
        billingActivation: input.billingActivation,
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
  const caseId = rawCaseId === undefined ? undefined : canonicalMdiCasePointer(rawCaseId);
  const patientId = rawPatientId === undefined ? undefined : canonicalMdiPatientPointer(rawPatientId);
  if ((rawCaseId !== undefined && caseId === null) || (rawPatientId !== undefined && patientId === null)) {
    return { ok: false };
  }
  if (contract.handling === "inline" && caseId === undefined) {
    return { ok: false };
  }
  if (contract.handling === "charge" && caseId === undefined) {
    return { ok: false };
  }
  if (contract.handling === "cue" && caseId === undefined && patientId === undefined) {
    return { ok: false };
  }
  const cuePointer = contract.handling === "cue"
    ? cuePointerForMdiPayload({
      eventType,
      parsed,
      payload: input.payload,
    })
    : undefined;
  if (contract.handling === "cue" && cuePointer === null) {
    return { ok: false };
  }
  const providedEventId = providerMdiEventId(parsed);
  if (contract.handling === "charge" && providedEventId === undefined) {
    return { ok: false };
  }
  const eventId = providedEventId ?? createDeterministicMdiEventId({
    caseId: caseId ?? undefined,
    eventType,
    patientId: patientId ?? undefined,
    resourceId: cuePointer ?? undefined,
    timestamp,
  });
  const charge = contract.handling === "charge"
    ? normalizeMdiPartnerCharge({
      caseId: caseId ?? undefined,
      eventId,
      eventType,
      parsed,
      patientId: patientId ?? undefined,
    })
    : undefined;
  if (charge === null) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      caseId: caseId ?? undefined,
      charge: charge ?? undefined,
      claimEventId: charge
        ? `${eventId}_charge_${charge.fingerprint.slice(0, 16)}`
        : undefined,
      contract,
      cuePointer: cuePointer ?? undefined,
      eventId,
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
  billingActivation?: MdiBillingActivation;
  mdiMirrorRepository: MdiWebhookMirrorRepository;
  now: string;
  webhook: NormalizedMdiWebhook;
}) {
  if (input.webhook.contract.handling === "charge") {
    return handleVerifiedMdiPartnerCharge(input);
  }

  if (input.webhook.contract.handling === "cue") {
    return handleVerifiedMdiCue(input);
  }

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

  const evidence = await input.mdiMirrorRepository.recordCurrentCaseStatusEvidence({
    actorType: "vendor",
    caseStatus,
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
    statusRank: caseStatusRank(caseStatus),
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: isTerminalCaseStatus(caseStatus),
    webhookEventId: input.webhook.eventId,
    webhookProvider: "mdi",
  });
  if (!evidence.ok) {
    if (evidence.error.kind === "stale_transition") {
      return { outcome: "processed" as const };
    }
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
  if (input.billingActivation) {
    const sideEffect = billing.decision.action === "activate_billing"
      ? await input.billingActivation.activate({
        cognitoSub: patient.value,
        mdiCaseId: caseId,
        now: input.now,
        webhookEventId: input.webhook.eventId,
      })
      : billing.decision.action === "cancel_active_billing"
        ? await input.billingActivation.cancel({
          cognitoSub: patient.value,
          mdiCaseId: caseId,
          now: input.now,
          webhookEventId: input.webhook.eventId,
        })
        : { ok: true as const };
    if (!sideEffect.ok) {
      return sideEffect.retryable
        ? { outcome: "failed" as const, retryable: true, durableRetry: false }
        : { outcome: "failed" as const, retryable: false, durableRetry: false };
    }
  }

  return { outcome: "processed" as const };
}

async function handleVerifiedMdiPartnerCharge(input: {
  mdiMirrorRepository: MdiWebhookMirrorRepository;
  now: string;
  webhook: NormalizedMdiWebhook;
}) {
  const caseId = input.webhook.caseId;
  const charge = input.webhook.charge;
  if (!caseId || !charge) {
    return { outcome: "failed" as const, retryable: false, durableRetry: false };
  }

  const patient = await input.mdiMirrorRepository.findPatientByMdiCase(caseId);
  if (!patient.ok) {
    return appDataFailure(patient.error);
  }
  if (!patient.value) {
    return { outcome: "failed" as const, retryable: true, durableRetry: false };
  }

  const linkage = await input.mdiMirrorRepository.getMdiLinkage(patient.value);
  if (!linkage.ok) {
    return appDataFailure(linkage.error);
  }
  if (!linkage.value || linkage.value.mdiCaseId !== caseId) {
    return { outcome: "failed" as const, retryable: true, durableRetry: false };
  }

  const eventId = mdiPartnerChargeEventId({
    caseId,
    chargeCode: charge.chargeCode,
    webhookEventId: input.webhook.eventId,
  });
  const metadata = {
    amount_cents: String(charge.amountCents),
    charge_code: charge.chargeCode,
    currency: charge.currency,
    fingerprint: charge.fingerprint,
    ...(charge.referenceType === undefined ? {} : { reference_type: charge.referenceType }),
  };
  const evidence = await input.mdiMirrorRepository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: patient.value,
    eventCategory: "mdi_handoff",
    eventId,
    eventType: "mdi_partner_charge_recorded",
    occurredAt: input.webhook.providerTimestamp,
    recordedAt: input.now,
    mdiCaseId: caseId,
    mdiPatientId: linkage.value.mdiPatientId,
    metadata,
    source: "webhook",
    status: "recorded",
    summaryCode: "MDI_PARTNER_CHARGE_RECORDED",
  });
  if (evidence.ok) {
    return { outcome: "processed" as const };
  }
  if (evidence.error.kind !== "conditional_conflict") {
    return appDataFailure(evidence.error);
  }

  const priorEvidence = await input.mdiMirrorRepository.listEvidenceEventsForMdiCase({
    cognitoSub: patient.value,
    mdiCaseId: caseId,
    limit: 100,
  });
  if (!priorEvidence.ok) {
    return appDataFailure(priorEvidence.error);
  }
  const existing = priorEvidence.value.find((event) => event.eventId === eventId);
  if (
    existing?.eventType === "mdi_partner_charge_recorded" &&
    existing.metadata?.fingerprint === charge.fingerprint
  ) {
    return { outcome: "processed" as const };
  }
  return { outcome: "failed" as const, retryable: false, durableRetry: false };
}

async function handleVerifiedMdiCue(input: {
  mdiMirrorRepository: MdiWebhookMirrorRepository;
  now: string;
  webhook: NormalizedMdiWebhook;
}) {
  const cue = dashboardCueForMdiWebhook(input.webhook);
  if (!cue) {
    return { outcome: "processed" as const };
  }

  const patient = input.webhook.caseId
    ? await input.mdiMirrorRepository.findPatientByMdiCase(input.webhook.caseId)
    : input.webhook.patientId
      ? await input.mdiMirrorRepository.findPatientByMdiPatient(input.webhook.patientId)
      : { ok: true as const, value: null };
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
  if (!linkage.value) {
    return { outcome: "processed" as const };
  }
  if (input.webhook.caseId && linkage.value.mdiCaseId !== input.webhook.caseId) {
    return { outcome: "processed" as const };
  }
  if (input.webhook.patientId && linkage.value.mdiPatientId !== input.webhook.patientId) {
    return { outcome: "processed" as const };
  }

  const subject = input.webhook.caseId
    ? { kind: "case" as const, id: input.webhook.caseId }
    : { kind: "patient" as const, id: linkage.value.mdiPatientId };
  const evidence = await input.mdiMirrorRepository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: patient.value,
    eventCategory: "mdi_handoff",
    eventId: mdiDashboardCueEventId({
      cueCode: cue.code,
      pointer: cue.pointer,
      subject,
      webhookEventId: input.webhook.eventId,
    }),
    eventType: "mdi_dashboard_cue_recorded",
    occurredAt: input.webhook.providerTimestamp,
    recordedAt: input.now,
    mdiPatientId: linkage.value.mdiPatientId,
    ...(input.webhook.caseId === undefined ? {} : { mdiCaseId: input.webhook.caseId }),
    metadata: {
      cue_action: cue.action,
      cue_code: cue.code,
      cue_family: cue.family,
    },
    source: "webhook",
    status: cue.action === "noop" ? "skipped" : "recorded",
    summaryCode: "MDI_DASHBOARD_CUE_RECORDED",
  });
  if (evidence.ok || evidence.error.kind === "conditional_conflict") {
    return { outcome: "processed" as const };
  }
  return appDataFailure(evidence.error);
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
): Promise<
  | { ok: true; decision: BillingUnlockDecision }
  | { ok: false; retryable: boolean }
> {
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
    return { ok: true, decision };
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

function billingStateForStripeStatus(status: BillingStatus | undefined): BillingState {
  if (status === "payment_method_collected") {
    return "payment_method_collected";
  }
  if (status === "active") {
    return "subscription_active";
  }
  if (status === "past_due") {
    return "subscription_active";
  }
  if (status === "cancel_pending") {
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

function mdiPartnerChargeEventId(input: {
  caseId: string;
  chargeCode: MdiPartnerChargeCode;
  webhookEventId: string;
}) {
  return `mdi:partner_charge:${input.caseId}:${input.chargeCode}:${input.webhookEventId}`;
}

function dashboardCueForMdiWebhook(webhook: NormalizedMdiWebhook): MdiDashboardCue | null {
  if (!webhook.cuePointer) {
    return null;
  }
  switch (webhook.eventType) {
    case "message_created":
      return {
        action: "open_mdi",
        code: "open_mdi_messages",
        family: "message",
        pointer: webhook.cuePointer,
      };
    case "case_file_added":
      return {
        action: "status_available",
        code: "open_mdi_files",
        family: "file",
        pointer: webhook.cuePointer,
      };
    case "case_file_deleted":
      return {
        action: "status_unavailable",
        code: "files_unavailable",
        family: "file",
        pointer: webhook.cuePointer,
      };
    case "file_lab_results_processed":
      return {
        action: "status_available",
        code: "open_mdi_files",
        family: "lab",
        pointer: webhook.cuePointer,
      };
    case "file_upload_requested":
      return {
        action: "action_needed",
        code: "file_action_needed",
        family: "workflow",
        pointer: webhook.cuePointer,
      };
    case "exam_requested":
      return {
        action: "action_needed",
        code: "exam_action_needed",
        family: "exam",
        pointer: webhook.cuePointer,
      };
    case "voucher_created":
    case "voucher_updated":
    case "voucher_reminder_sent":
      return {
        action: "status_available",
        code: "benefit_status_pending",
        family: "voucher",
        pointer: webhook.cuePointer,
      };
    case "voucher_used":
    case "voucher_expired":
      return {
        action: "noop",
        code: "cue_noop",
        family: "voucher",
        pointer: webhook.cuePointer,
      };
    default:
      return null;
  }
}

function cuePointerForMdiPayload(input: {
  eventType: string;
  parsed: Record<string, unknown>;
  payload: string | Buffer;
}): string | null {
  switch (input.eventType) {
    case "message_created":
      return safeMdiOpaqueId(stringField(input.parsed, "message_id"), "mdi_message");
    case "case_file_added":
    case "case_file_deleted":
    case "file_lab_results_processed":
      return safeMdiOpaqueId(stringField(input.parsed, "file_id"), "mdi_file");
    case "voucher_created":
    case "voucher_updated":
    case "voucher_used":
    case "voucher_reminder_sent":
    case "voucher_expired":
      return safeMdiOpaqueId(stringField(input.parsed, "voucher_id"), "mdi_voucher");
    case "file_upload_requested":
    case "exam_requested":
      return `request_${sha256Payload(input.payload).slice(0, 32)}`;
    default:
      return null;
  }
}

function safeMdiOpaqueId(value: string | undefined, prefix: string) {
  if (
    value === undefined ||
    value.length > maxMdiCuePointerLength ||
    !value.startsWith(`${prefix}_`) ||
    !/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(value) ||
    unsafeMdiCuePointerPatterns.some((pattern) => pattern.test(value))
  ) {
    return null;
  }
  return value;
}

function mdiDashboardCueEventId(input: {
  cueCode: MdiDashboardCueCode;
  pointer: string;
  subject: { kind: "case" | "patient"; id: string };
  webhookEventId: string;
}) {
  return `mdi:dashboard_cue:${input.subject.kind}:${input.subject.id}:${input.cueCode}:${input.pointer}:${input.webhookEventId}`;
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

function providerMdiEventId(record: Record<string, unknown>) {
  const value = stringField(record, "event_id") ?? stringField(record, "eventId") ?? stringField(record, "id");
  return value && /^mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(value)
    ? value
    : undefined;
}

function canonicalMdiPatientPointer(value: string) {
  return canonicalMdiPatientId(value) ??
    (value.startsWith("mdi_patient_") ? canonicalMdiPatientId(value.slice("mdi_patient_".length)) : null);
}

function canonicalMdiCasePointer(value: string) {
  return canonicalMdiCaseId(value) ??
    (value.startsWith("mdi_case_") ? canonicalMdiCaseId(value.slice("mdi_case_".length)) : null);
}

function normalizeMdiPartnerCharge(input: {
  caseId?: string;
  eventId: string;
  eventType: string;
  parsed: Record<string, unknown>;
  patientId?: string;
}): NormalizedMdiPartnerCharge | null {
  if (!isMdiPartnerChargeCode(input.eventType) || !input.caseId) {
    return null;
  }

  const amountCents = parseMdiChargeAmountCents(input.parsed);
  if (amountCents === null) {
    return null;
  }

  const currency = stringField(input.parsed, "currency")?.toLowerCase();
  if (currency !== "usd") {
    return null;
  }

  const reference = mdiPartnerChargeReference(input.eventType, input.parsed);
  if (reference === null) {
    return null;
  }

  const fingerprint = sha256([
    input.eventId,
    input.eventType,
    input.patientId ?? "",
    input.caseId,
    String(amountCents),
    currency,
    reference?.id ?? "",
  ].join("|"));

  return {
    amountCents,
    chargeCode: input.eventType,
    currency,
    fingerprint,
    ...(reference === undefined ? {} : { referenceType: reference.type }),
  };
}

function parseMdiChargeAmountCents(record: Record<string, unknown>) {
  const directCents = record.amountCents ?? record.amount_cents;
  if (directCents !== undefined) {
    return parseIntegralCents(directCents);
  }

  const chargeAmount = record.charge_amount;
  if (typeof chargeAmount !== "string") {
    return null;
  }
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(chargeAmount)) {
    return null;
  }
  const [dollars, cents = ""] = chargeAmount.split(".");
  return parseIntegralCents(`${dollars}${cents.padEnd(2, "0")}`);
}

function parseIntegralCents(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    return validChargeAmountCents(value) ? value : null;
  }
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    return null;
  }
  const cents = Number(value);
  return Number.isSafeInteger(cents) && validChargeAmountCents(cents) ? cents : null;
}

function validChargeAmountCents(value: number) {
  return value > 0 && value <= maxMdiPartnerChargeAmountCents;
}

function mdiPartnerChargeReference(
  eventType: MdiPartnerChargeCode,
  record: Record<string, unknown>,
) {
  if (eventType === "partner_additional_charge") {
    const id = normalizeSafeMdiReferenceId(
      stringField(record, "chargeReferenceId") ?? stringField(record, "charge_reference_id"),
      "mdi_charge",
    );
    return id === null ? null : id === undefined ? undefined : { id, type: "charge" as const };
  }

  const id = normalizeSafeMdiReferenceId(
    stringField(record, "voucherId") ?? stringField(record, "voucher_id"),
    "mdi_voucher",
  );
  return id === null ? null : id === undefined ? undefined : { id, type: "voucher" as const };
}

function normalizeSafeMdiReferenceId(value: string | undefined, prefix: "mdi_charge" | "mdi_voucher") {
  if (value === undefined) {
    return undefined;
  }
  if (unsafeMdiChargeReferencePatterns.some((pattern) => pattern.test(value))) {
    return null;
  }
  if (safeMdiOpaqueId(value, prefix)) {
    return value;
  }
  if (value.startsWith(`${prefix}_`)) {
    const uuid = value.slice(`${prefix}_`.length);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
      return `${prefix}_${uuid.replaceAll("-", "").toLowerCase()}`;
    }
  }
  return null;
}

function isMdiPartnerChargeCode(value: string): value is MdiPartnerChargeCode {
  return value === "partner_additional_charge" || value === "vouched_amount_charge";
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
  resourceId?: string;
  timestamp?: string;
}) {
  const digest = sha256([
    input.eventType,
    input.timestamp ?? "",
    input.caseId ?? "",
    input.patientId ?? "",
    input.resourceId ?? "",
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
const maxMdiCuePointerLength = 128;
const maxMdiPartnerChargeAmountCents = 100_000;
const maxMdiProviderRetryAttempts = 1_000_000;

const unsafeMdiCuePointerPatterns = [
  /answer/i,
  /diagnosis/i,
  /dob/i,
  /email/i,
  /lab/i,
  /medication/i,
  /patient_name/i,
  /phone/i,
  /questionnaire/i,
  /ssn/i,
  /symptom/i,
  /token/i,
  /url/i,
];

const unsafeMdiChargeReferencePatterns = [
  /clinical/i,
  /diagnosis/i,
  /medication/i,
  /note/i,
  /order/i,
  /prescription/i,
  /product/i,
  /questionnaire/i,
  /treatment/i,
];
