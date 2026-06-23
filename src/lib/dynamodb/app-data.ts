import type { WebhookProvider } from "@/lib/webhooks";
import {
  currentRequiredConsents,
  evaluateConsentRequirements,
  isConsentKind,
  type ConsentKind,
  type ConsentRequirementStatus,
  type RequiredConsentDocument,
} from "@/lib/consents";
import { isUsStateCode, type UsStateCode } from "../../../shared/intake/us-states";
import {
  evidenceEventSchema,
  type EvidenceActorType,
  type EvidenceEventCategory,
  type EvidenceEventMetadata,
  type EvidenceEventMetadataValue,
  type EvidenceEventStatus,
  type EvidenceEventType,
  type EvidenceLinkageRequirement,
} from "./evidence-schema";

export type {
  EvidenceActorType,
  EvidenceEventCategory,
  EvidenceEventMetadata,
  EvidenceEventMetadataValue,
  EvidenceEventStatus,
  EvidenceEventType,
  EvidenceLinkageRequirement,
} from "./evidence-schema";

export type AppDataKey = {
  pk: string;
  sk: string;
};

export type AppDataErrorKind =
  | "validation_failed"
  | "conditional_conflict"
  | "stale_transition"
  | "duplicate_webhook_claim"
  | "stale_webhook_claim"
  | "retryable_client_failure"
  | "unexpected_client_failure"
  | "not_found";

export type AppDataError = {
  kind: AppDataErrorKind;
  message: string;
};

export type AppDataResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppDataError };

export type OnboardingStatus =
  | "profile_pending"
  | "intake_ready"
  | "mdi_submitted"
  | "clinical_review"
  | "billing_ready";

export type BillingStatus =
  | "not_started"
  | "payment_method_pending"
  | "payment_method_collected"
  | "active"
  | "past_due"
  | "canceled";

export type WebhookProcessingStatus = "processing" | "processed" | "failed";

type BaseRecord = AppDataKey & {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
};

export type PatientProfileRecord = BaseRecord & {
  recordType: "patientProfile";
  cognitoSub: string;
  onboardingStatus: OnboardingStatus;
  residencyState?: UsStateCode;
};

export type MdiLinkageRecord = BaseRecord & {
  recordType: "mdiLinkage";
  cognitoSub: string;
  mdiPatientId: string;
  mdiCaseId?: string;
};

export type MdiReverseLookupRecord = BaseRecord &
  (
    | {
        recordType: "mdiReverseLookup";
        cognitoSub: string;
        pointerType: "patient";
        mdiPatientId: string;
        mdiCaseId?: never;
      }
    | {
        recordType: "mdiReverseLookup";
        cognitoSub: string;
        pointerType: "case";
        mdiCaseId: string;
        mdiPatientId?: never;
      }
  );

export type MdiPatientCreateStatus =
  | "claiming"
  | "provider_retryable_failure"
  | "provider_terminal_failure"
  | "storage_retryable_failure"
  | "linked";

export type MdiPatientCreateAttemptRecord = BaseRecord & {
  recordType: "mdiPatientCreateAttempt";
  cognitoSub: string;
  status: MdiPatientCreateStatus;
  attempts: number;
  idempotencyKey: string;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  linkedAt?: string;
  retryAfterSeconds?: number;
  providerStatus?: number;
  mdiPatientId?: string;
};

export type MdiCaseCreateStatus =
  | "claiming_case"
  | "case_provider_retryable_failure"
  | "case_provider_terminal_failure"
  | "case_storage_retryable_failure"
  | "submitted";

export type MdiCaseCreateAttemptRecord = BaseRecord & {
  recordType: "mdiCaseCreateAttempt";
  cognitoSub: string;
  status: MdiCaseCreateStatus;
  attempts: number;
  idempotencyKey: string;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  linkedAt?: string;
  submittedAt?: string;
  providerStatus?: number;
  mdiPatientId?: string;
  mdiCaseId?: string;
  mdiSubmissionId?: string;
};

export type MdiCaseStatusMirrorRecord = BaseRecord & {
  recordType: "mdiCaseStatusMirror";
  cognitoSub: string;
  mdiPatientId: string;
  mdiCaseId: string;
  caseStatus: MdiMirroredCaseStatus;
  providerTimestamp: string;
  webhookEventId: string;
  statusRank: number;
  terminal: boolean;
};

export type MdiCaseStatusReconciliationIndexRecord = BaseRecord & {
  recordType: "mdiCaseStatusReconciliationIndex";
  cognitoSub: string;
  mdiPatientId: string;
  mdiCaseId: string;
  caseStatus: MdiMirroredCaseStatus;
  providerTimestamp: string;
  webhookEventId: string;
  statusRank: number;
  terminal: boolean;
};

export type StripeLinkageRecord = BaseRecord & {
  recordType: "stripeLinkage";
  cognitoSub: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  billingStatus: BillingStatus;
  stripeBillingStatusObservedAt?: string;
  stripeCurrentPeriodStart?: string;
  stripeCurrentPeriodEnd?: string;
};

export type StripeReverseLookupRecord = BaseRecord &
  (
    | {
        recordType: "stripeReverseLookup";
        cognitoSub: string;
        pointerType: "customer";
        stripeCustomerId: string;
        stripeSubscriptionId?: never;
      }
    | {
        recordType: "stripeReverseLookup";
        cognitoSub: string;
        pointerType: "subscription";
        stripeSubscriptionId: string;
        stripeCustomerId?: never;
      }
  );

export type ConsentEvidenceRecord = BaseRecord & {
  recordType: "consentEvidence";
  cognitoSub: string;
  consentKind: ConsentKind;
  version: string;
  acceptedAt: string;
  ipHash?: string;
  userAgentHash?: string;
};

export type WebhookIdempotencyRecord = BaseRecord & {
  recordType: "webhookIdempotency";
  provider: WebhookProvider;
  eventId: string;
  status: WebhookProcessingStatus;
  retryable: boolean;
  attempts: number;
  retryOwner?: "provider" | "queue" | "handoff";
  processingExpiresAt?: string;
  nextAttemptAfter?: string;
  maxAttempts?: number;
  retryExhaustedAt?: string;
};

export type EvidenceEventRecord = BaseRecord & {
  recordType: "evidenceEvent";
  cognitoSub: string;
  eventId: string;
  eventType: EvidenceEventType;
  eventCategory: EvidenceEventCategory;
  occurredAt: string;
  recordedAt: string;
  actorType: EvidenceActorType;
  status: EvidenceEventStatus;
  summaryCode: string;
  mdiPatientId?: string;
  mdiCaseId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  webhookProvider?: WebhookProvider;
  webhookEventId?: string;
  requestId?: string;
  adminActorId?: string;
  source?: string;
  metadata?: EvidenceEventMetadata;
};

export type EvidenceEventUniquenessRecord = BaseRecord & {
  recordType: "evidenceEventUniqueness";
  cognitoSub: string;
  eventId: string;
  evidencePk: string;
  evidenceSk: string;
};

export type EvidenceCaseIndexRecord = BaseRecord & {
  recordType: "evidenceCaseIndex";
  cognitoSub: string;
  mdiCaseId: string;
  eventId: string;
  evidencePk: string;
  evidenceSk: string;
};

export type OperationalStatusRecord = BaseRecord & {
  recordType: "operationalStatus";
  name: string;
  status: string;
  stage?: string;
  jobName?: string;
  lastHeartbeatAt?: string;
  lastScheduledAt?: string;
  lastRequestId?: string;
  lastCursorPk?: string;
  lastCursorSk?: string;
};

export type AppDataRecord =
  | PatientProfileRecord
  | MdiLinkageRecord
  | MdiReverseLookupRecord
  | MdiPatientCreateAttemptRecord
  | MdiCaseCreateAttemptRecord
  | MdiCaseStatusMirrorRecord
  | MdiCaseStatusReconciliationIndexRecord
  | StripeLinkageRecord
  | StripeReverseLookupRecord
  | ConsentEvidenceRecord
  | WebhookIdempotencyRecord
  | EvidenceEventRecord
  | EvidenceEventUniquenessRecord
  | EvidenceCaseIndexRecord
  | OperationalStatusRecord;

export type AppDataRepository = {
  get(key: AppDataKey): AppDataResult<AppDataRecord | null>;
  queryByKeyPrefix(input: {
    pk: string;
    skPrefix: string;
    limit?: number;
    exclusiveStartKey?: AppDataKey;
  }): AppDataResult<{ items: AppDataRecord[]; nextKey?: AppDataKey }>;
  put<T extends AppDataRecord>(record: T, options?: { ifNotExists?: boolean }): AppDataResult<T>;
  update<T extends AppDataRecord>(record: T, options?: { expected?: AppDataRecord }): AppDataResult<T>;
  delete(key: AppDataKey, options?: { expected?: AppDataRecord }): AppDataResult<void>;
  transactWrite(operations: TransactWriteOperation[]): AppDataResult<void>;
};

export type TransactWriteOperation =
  | { type: "put"; record: AppDataRecord; ifNotExists?: boolean }
  | { type: "update"; record: AppDataRecord; expected?: AppDataRecord }
  | { type: "delete"; key: AppDataKey; expected?: AppDataRecord };

export type RecordCurrentMdiCaseStatusEvidenceInput =
  Parameters<typeof createEvidenceEventRecord>[0] & {
    caseStatus: MdiMirroredCaseStatus;
    statusRank: number;
    terminal: boolean;
  };

export type MdiMirroredCaseStatus =
  | "assigned"
  | "approved"
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

export type WebhookClaimOutcome =
  | { outcome: "claimed"; record: WebhookIdempotencyRecord }
  | { outcome: "alreadyProcessing"; record: WebhookIdempotencyRecord }
  | { outcome: "alreadyProcessed"; record: WebhookIdempotencyRecord }
  | { outcome: "failedRetryable"; record: WebhookIdempotencyRecord }
  | { outcome: "retryNotDue"; record: WebhookIdempotencyRecord }
  | { outcome: "queueOwnedRetry"; record: WebhookIdempotencyRecord }
  | { outcome: "staleQueueDelivery"; record: WebhookIdempotencyRecord }
  | { outcome: "processingLeaseExpired"; record: WebhookIdempotencyRecord }
  | { outcome: "retryExhausted"; record: WebhookIdempotencyRecord }
  | { outcome: "conflict"; record: WebhookIdempotencyRecord };

export function patientProfileKey(cognitoSub: string): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: "PROFILE" };
}

export function mdiLinkageKey(cognitoSub: string): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: "MDI#LINKAGE" };
}

export function mdiPatientReverseKey(mdiPatientId: string): AppDataKey {
  return { pk: `MDI#PATIENT#${mdiPatientId}`, sk: "PATIENT" };
}

export function mdiCaseReverseKey(mdiCaseId: string): AppDataKey {
  return { pk: `MDI#CASE#${mdiCaseId}`, sk: "PATIENT" };
}

export function mdiCaseStatusMirrorKey(mdiCaseId: string): AppDataKey {
  return { pk: `MDI#CASE#${mdiCaseId}`, sk: "STATUS#CURRENT" };
}

export function mdiCaseStatusReconciliationIndexKey(mdiCaseId: string): AppDataKey {
  return { pk: mdiCaseStatusReconciliationIndexPk, sk: `CASE#${mdiCaseId}` };
}

export const mdiCaseStatusReconciliationIndexPk = "MDI#CASE_STATUS_RECONCILIATION#ACTIVE";

export function mdiPatientCreateAttemptKey(cognitoSub: string): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: "MDI#PATIENT_CREATE" };
}

export function mdiCaseCreateAttemptKey(cognitoSub: string): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: "MDI#CASE_CREATE" };
}

export function stripeLinkageKey(cognitoSub: string): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: "STRIPE#LINKAGE" };
}

export function stripeCustomerReverseKey(stripeCustomerId: string): AppDataKey {
  return { pk: `STRIPE#CUSTOMER#${stripeCustomerId}`, sk: "PATIENT" };
}

export function stripeSubscriptionReverseKey(stripeSubscriptionId: string): AppDataKey {
  return { pk: `STRIPE#SUBSCRIPTION#${stripeSubscriptionId}`, sk: "PATIENT" };
}

export function consentEvidenceKey(
  cognitoSub: string,
  consentKind: ConsentKind,
  version: string,
): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: `CONSENT#${consentKind}#${version}` };
}

export function legacyConsentEvidenceKey(
  cognitoSub: string,
  version: string,
): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: `CONSENT#${version}` };
}

export function webhookIdempotencyKey(
  provider: WebhookProvider,
  eventId: string,
): AppDataKey {
  return { pk: `WEBHOOK#${provider}#EVENT#${eventId}`, sk: "CLAIM" };
}

export function evidenceEventKey(
  cognitoSub: string,
  occurredAt: string,
  eventId: string,
): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: `EVIDENCE#${occurredAt}#${eventId}` };
}

export function evidenceEventUniquenessKey(eventId: string): AppDataKey {
  return { pk: `EVIDENCE#EVENT#${eventId}`, sk: "UNIQUE" };
}

export function patientEvidenceEventUniquenessKey(
  cognitoSub: string,
  eventId: string,
): AppDataKey {
  return { pk: `PATIENT#${cognitoSub}`, sk: `EVIDENCE_UNIQUE#EVENT#${eventId}` };
}

export function evidenceCaseIndexKey(
  mdiCaseId: string,
  occurredAt: string,
  eventId: string,
): AppDataKey {
  return { pk: `MDI#CASE#${mdiCaseId}`, sk: `EVIDENCE#${occurredAt}#${eventId}` };
}

export function createWebhookEvidenceEventId(
  provider: WebhookProvider,
  webhookEventId: string,
  summaryCode: string,
  sideEffect?: string,
): string {
  return sideEffect
    ? `webhook:${provider}:${webhookEventId}:${summaryCode}:${sideEffect}`
    : `webhook:${provider}:${webhookEventId}:${summaryCode}`;
}

export function operationalStatusKey(name: string): AppDataKey {
  return { pk: `STATUS#${name}`, sk: "CURRENT" };
}

export function createInMemoryAppDataRepository(
  seed: AppDataRecord[] = [],
  options: { validateSeed?: boolean } = {},
): AppDataRepository {
  const records = new Map<string, AppDataRecord>();

  for (const record of seed) {
    if (options.validateSeed !== false) {
      const validation = validateAppDataRecord(record);
      if (!validation.ok) {
        throw new Error(validation.error.message);
      }
    }
    records.set(compoundKey(record), cloneRecord(record));
  }

  return {
    get(key) {
      const record = records.get(compoundKey(key));
      if (!record) {
        return ok(null);
      }

      const validation = validateAppDataRecord(record);
      if (!validation.ok) {
        return validation;
      }

      return ok(cloneRecord(record));
    },
    queryByKeyPrefix(input) {
      if (
        typeof input.pk !== "string" ||
        typeof input.skPrefix !== "string" ||
        (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) ||
        (input.exclusiveStartKey !== undefined &&
          (input.exclusiveStartKey.pk !== input.pk ||
            !input.exclusiveStartKey.sk.startsWith(input.skPrefix)))
      ) {
        return err("validation_failed", "Invalid key-prefix query");
      }

      const result: AppDataRecord[] = [];
      for (const record of records.values()) {
        if (record.pk !== input.pk || !record.sk.startsWith(input.skPrefix)) {
          continue;
        }

        const validation = validateAppDataRecord(record);
        if (!validation.ok) {
          return validation;
        }

        result.push(cloneRecord(record));
      }

      result.sort((left, right) => left.sk.localeCompare(right.sk));
      let startIndex = 0;
      if (input.exclusiveStartKey) {
        const exclusiveIndex = result.findIndex((record) => (
          record.pk === input.exclusiveStartKey?.pk &&
          record.sk === input.exclusiveStartKey?.sk
        ));
        if (exclusiveIndex < 0) {
          return err("validation_failed", "Exclusive start key was not found");
        }
        startIndex = exclusiveIndex + 1;
      }

      const items = result.slice(startIndex, input.limit === undefined
        ? undefined
        : startIndex + input.limit);
      const lastItem = items.at(-1);
      const hasMore = input.limit !== undefined && startIndex + input.limit < result.length;

      return ok({
        items,
        nextKey: hasMore && lastItem
          ? { pk: lastItem.pk, sk: lastItem.sk }
          : undefined,
      });
    },
    put(record, options) {
      const validation = validateAppDataRecord(record);
      if (!validation.ok) {
        return validation;
      }

      const key = compoundKey(record);
      if (options?.ifNotExists && records.has(key)) {
        return err("conditional_conflict", `Record already exists for ${key}`);
      }

      records.set(key, cloneRecord(record));
      return ok(cloneRecord(record));
    },
    update(record, options) {
      const validation = validateAppDataRecord(record);
      if (!validation.ok) {
        return validation;
      }

      const key = compoundKey(record);
      const existing = records.get(key);
      if (!existing) {
        return err("not_found", `Record not found for ${key}`);
      }

      if (options?.expected && !recordsEqual(existing, options.expected)) {
        return err("conditional_conflict", `Expected record did not match ${key}`);
      }

      records.set(key, cloneRecord(record));
      return ok(cloneRecord(record));
    },
    delete(key, options) {
      const existing = records.get(compoundKey(key));
      if (!existing) {
        return err("not_found", `Record not found for ${compoundKey(key)}`);
      }

      if (options?.expected && !recordsEqual(existing, options.expected)) {
        return err("conditional_conflict", `Expected record did not match ${compoundKey(key)}`);
      }

      records.delete(compoundKey(key));
      return ok(undefined);
    },
    transactWrite(operations) {
      const staged = new Map<string, AppDataRecord | null>();
      const stagedGet = (key: AppDataKey) => {
        const compound = compoundKey(key);
        return staged.has(compound) ? staged.get(compound) : records.get(compound);
      };

      for (const operation of operations) {
        if (operation.type === "delete") {
          const key = compoundKey(operation.key);
          const existing = stagedGet(operation.key);
          if (!existing && operation.expected) {
            return err("not_found", `Record not found for ${key}`);
          }
          if (existing && operation.expected && !recordsEqual(existing, operation.expected)) {
            return err("conditional_conflict", `Expected record did not match ${key}`);
          }
          staged.set(key, null);
          continue;
        }

        const validation = validateAppDataRecord(operation.record);
        if (!validation.ok) {
          return validation;
        }

        const key = compoundKey(operation.record);
        if (operation.type === "put") {
          if (operation.ifNotExists && stagedGet(operation.record)) {
            return err("conditional_conflict", `Record already exists for ${key}`);
          }
          staged.set(key, cloneRecord(operation.record));
          continue;
        }

        const existing = stagedGet(operation.record);
        if (!existing) {
          return err("not_found", `Record not found for ${key}`);
        }

        if (operation.expected && !recordsEqual(existing, operation.expected)) {
          return err("conditional_conflict", `Expected record did not match ${key}`);
        }
        staged.set(key, cloneRecord(operation.record));
      }

      for (const [key, value] of staged.entries()) {
        if (value) {
          records.set(key, value);
        } else {
          records.delete(key);
        }
      }

      return ok(undefined);
    },
  };
}

export function createPatientProfileRecord(input: {
  cognitoSub: string;
  onboardingStatus: OnboardingStatus;
  now: string;
  residencyState?: UsStateCode;
}): PatientProfileRecord {
  return {
    ...patientProfileKey(input.cognitoSub),
    recordType: "patientProfile",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    onboardingStatus: input.onboardingStatus,
    ...(input.residencyState ? { residencyState: input.residencyState } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function getPatientProfile(
  repository: AppDataRepository,
  cognitoSub: string,
): AppDataResult<PatientProfileRecord | null> {
  const record = repository.get(patientProfileKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<PatientProfileRecord | null>;
  }
  if (record.value.recordType !== "patientProfile") {
    return err("validation_failed", "Patient profile key contains another record type");
  }
  return ok(record.value);
}

export function getMdiLinkage(
  repository: AppDataRepository,
  cognitoSub: string,
): AppDataResult<MdiLinkageRecord | null> {
  const record = repository.get(mdiLinkageKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<MdiLinkageRecord | null>;
  }
  if (record.value.recordType !== "mdiLinkage") {
    return err("validation_failed", "MDI linkage key contains another record type");
  }
  return ok(record.value);
}

export function getMdiPatientCreateAttempt(
  repository: AppDataRepository,
  cognitoSub: string,
): AppDataResult<MdiPatientCreateAttemptRecord | null> {
  const record = repository.get(mdiPatientCreateAttemptKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<MdiPatientCreateAttemptRecord | null>;
  }
  if (record.value.recordType !== "mdiPatientCreateAttempt") {
    return err("validation_failed", "MDI patient create attempt key contains another record type");
  }
  return ok(record.value);
}

export function getMdiCaseCreateAttempt(
  repository: AppDataRepository,
  cognitoSub: string,
): AppDataResult<MdiCaseCreateAttemptRecord | null> {
  const record = repository.get(mdiCaseCreateAttemptKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<MdiCaseCreateAttemptRecord | null>;
  }
  if (record.value.recordType !== "mdiCaseCreateAttempt") {
    return err("validation_failed", "MDI case create attempt key contains another record type");
  }
  return ok(record.value);
}

export function getStripeLinkage(
  repository: AppDataRepository,
  cognitoSub: string,
): AppDataResult<StripeLinkageRecord | null> {
  const record = repository.get(stripeLinkageKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<StripeLinkageRecord | null>;
  }
  if (record.value.recordType !== "stripeLinkage") {
    return err("validation_failed", "Stripe linkage key contains another record type");
  }
  return ok(record.value);
}

export function getConsentEvidence(
  repository: AppDataRepository,
  input: { cognitoSub: string; consentKind: ConsentKind; version: string },
): AppDataResult<ConsentEvidenceRecord | null> {
  const record = repository.get(consentEvidenceKey(
    input.cognitoSub,
    input.consentKind,
    input.version,
  ));
  if (!record.ok || !record.value) {
    return record as AppDataResult<ConsentEvidenceRecord | null>;
  }
  if (record.value.recordType !== "consentEvidence") {
    return err("validation_failed", "Consent key contains another record type");
  }
  return ok(record.value);
}

export function getRequiredConsentEvidenceStatus(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    requiredConsents?: readonly RequiredConsentDocument[];
  },
): AppDataResult<{
  accepted: boolean;
  records: ConsentEvidenceRecord[];
  statuses: ConsentRequirementStatus[];
}> {
  const requiredConsents = input.requiredConsents ?? currentRequiredConsents;
  const records: ConsentEvidenceRecord[] = [];

  for (const consent of requiredConsents) {
    const result = repository.queryByKeyPrefix({
      pk: patientProfileKey(input.cognitoSub).pk,
      skPrefix: `CONSENT#${consent.consentKind}#`,
    });
    if (!result.ok) {
      return result;
    }

    for (const item of result.value.items) {
      if (item.recordType !== "consentEvidence") {
        return err("validation_failed", "Consent evidence query contained another record type");
      }
      records.push(item);
    }
  }

  const evaluation = evaluateConsentRequirements(records, requiredConsents);
  return ok({
    accepted: evaluation.accepted,
    records,
    statuses: evaluation.statuses,
  });
}

export function exportConsentEvidenceForReview(
  repository: AppDataRepository,
  input: { cognitoSub: string },
): AppDataResult<Array<{
  acceptedAt: string;
  consentKind: ConsentKind;
  ipHash?: string;
  userAgentHash?: string;
  version: string;
}>> {
  const records = repository.queryByKeyPrefix({
    pk: patientProfileKey(input.cognitoSub).pk,
    skPrefix: "CONSENT#",
  });
  if (!records.ok) {
    return records;
  }

  const evidence = records.value.items.map((record) => {
    if (record.recordType !== "consentEvidence") {
      return null;
    }
    return {
      acceptedAt: record.acceptedAt,
      consentKind: record.consentKind,
      ipHash: record.ipHash,
      userAgentHash: record.userAgentHash,
      version: record.version,
    };
  });
  if (evidence.some((record) => record === null)) {
    return err("validation_failed", "Consent export contained another record type");
  }

  return ok(evidence as Array<{
    acceptedAt: string;
    consentKind: ConsentKind;
    ipHash?: string;
    userAgentHash?: string;
    version: string;
  }>);
}

export function upsertPatientProfile(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    onboardingStatus: OnboardingStatus;
    now: string;
  },
): AppDataResult<PatientProfileRecord> {
  const existing = repository.get(patientProfileKey(input.cognitoSub));
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value) {
    return repository.put(createPatientProfileRecord(input));
  }
  if (existing.value.recordType !== "patientProfile") {
    return err("validation_failed", "Patient profile key contains another record type");
  }

  const record: PatientProfileRecord = {
    ...existing.value,
    updatedAt: input.now,
  };

  return repository.update(record, { expected: existing.value });
}

export function linkMdiPatientCase(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    mdiPatientId: string;
    mdiCaseId?: string;
    now: string;
  },
): AppDataResult<MdiLinkageRecord> {
  const existingLinkage = repository.get(mdiLinkageKey(input.cognitoSub));
  if (!existingLinkage.ok) {
    return existingLinkage;
  }
  if (existingLinkage.value && existingLinkage.value.recordType !== "mdiLinkage") {
    return err("validation_failed", "MDI linkage key contains another record type");
  }

  const linkage: MdiLinkageRecord = {
    ...mdiLinkageKey(input.cognitoSub),
    recordType: "mdiLinkage",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    mdiPatientId: input.mdiPatientId,
    mdiCaseId: input.mdiCaseId,
    createdAt: existingLinkage.value?.createdAt ?? input.now,
    updatedAt: input.now,
  };

  const reverseRecords: MdiReverseLookupRecord[] = [
    {
      ...mdiPatientReverseKey(input.mdiPatientId),
      recordType: "mdiReverseLookup",
      schemaVersion: 1,
      cognitoSub: input.cognitoSub,
      pointerType: "patient",
      mdiPatientId: input.mdiPatientId,
      createdAt: input.now,
      updatedAt: input.now,
    },
  ];

  if (input.mdiCaseId) {
    reverseRecords.push({
      ...mdiCaseReverseKey(input.mdiCaseId),
      recordType: "mdiReverseLookup",
      schemaVersion: 1,
      cognitoSub: input.cognitoSub,
      pointerType: "case",
      mdiCaseId: input.mdiCaseId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  const reverseCheck = partitionReverseRecords(
    repository,
    reverseRecords,
    input.cognitoSub,
  );
  if (!reverseCheck.ok) {
    return reverseCheck;
  }

  const staleDeletes = existingLinkage.value
    ? collectStaleMdiReverseDeletes(repository, existingLinkage.value, linkage)
    : ok([]);
  if (!staleDeletes.ok) {
    return staleDeletes;
  }

  const transaction = repository.transactWrite([
    { type: "put", record: linkage },
    ...staleDeletes.value,
    ...reverseCheck.value.map((record) => ({
      type: "put" as const,
      record,
      ifNotExists: true,
    })),
  ]);

  return transaction.ok ? ok(linkage) : transaction;
}

export function createMdiPatientLinkageIfAbsent(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    mdiPatientId: string;
    now: string;
  },
): AppDataResult<MdiLinkageRecord> {
  const existingLinkage = repository.get(mdiLinkageKey(input.cognitoSub));
  if (!existingLinkage.ok) {
    return existingLinkage;
  }
  if (existingLinkage.value) {
    if (existingLinkage.value.recordType !== "mdiLinkage") {
      return err("validation_failed", "MDI linkage key contains another record type");
    }
    return ok(existingLinkage.value);
  }

  const linkage: MdiLinkageRecord = {
    ...mdiLinkageKey(input.cognitoSub),
    recordType: "mdiLinkage",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    mdiPatientId: input.mdiPatientId,
    createdAt: input.now,
    updatedAt: input.now,
  };

  const reverseRecord: MdiReverseLookupRecord = {
    ...mdiPatientReverseKey(input.mdiPatientId),
    recordType: "mdiReverseLookup",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    pointerType: "patient",
    mdiPatientId: input.mdiPatientId,
    createdAt: input.now,
    updatedAt: input.now,
  };

  const reverseCheck = partitionReverseRecords(repository, [reverseRecord], input.cognitoSub);
  if (!reverseCheck.ok) {
    return reverseCheck;
  }

  const transaction = repository.transactWrite([
    { type: "put", record: linkage, ifNotExists: true },
    ...reverseCheck.value.map((record) => ({
      type: "put" as const,
      record,
      ifNotExists: true,
    })),
  ]);
  if (transaction.ok) {
    return ok(linkage);
  }
  if (transaction.error.kind !== "conditional_conflict") {
    return transaction;
  }

  const reread = repository.get(mdiLinkageKey(input.cognitoSub));
  if (!reread.ok) {
    return reread;
  }
  if (reread.value?.recordType === "mdiLinkage") {
    return ok(reread.value);
  }
  return transaction;
}

export function createMdiPatientCreateAttemptRecord(input: {
  attempts: number;
  cognitoSub: string;
  idempotencyKey: string;
  now: string;
  status: MdiPatientCreateStatus;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  linkedAt?: string;
  mdiPatientId?: string;
  providerStatus?: number;
  retryAfterSeconds?: number;
}): MdiPatientCreateAttemptRecord {
  return {
    ...mdiPatientCreateAttemptKey(input.cognitoSub),
    recordType: "mdiPatientCreateAttempt",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    status: input.status,
    attempts: input.attempts,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.claimExpiresAt ? { claimExpiresAt: input.claimExpiresAt } : {}),
    ...(input.lastAttemptAt ? { lastAttemptAt: input.lastAttemptAt } : {}),
    ...(input.linkedAt ? { linkedAt: input.linkedAt } : {}),
    ...(input.mdiPatientId ? { mdiPatientId: input.mdiPatientId } : {}),
    ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}),
    ...(input.retryAfterSeconds ? { retryAfterSeconds: input.retryAfterSeconds } : {}),
  };
}

export function linkMdiCaseIfAbsent(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    mdiPatientId: string;
    mdiCaseId: string;
    now: string;
  },
): AppDataResult<MdiLinkageRecord> {
  const existingLinkage = repository.get(mdiLinkageKey(input.cognitoSub));
  if (!existingLinkage.ok) {
    return existingLinkage;
  }
  if (!existingLinkage.value) {
    return err("not_found", "MDI patient linkage was not found");
  }
  if (existingLinkage.value.recordType !== "mdiLinkage") {
    return err("validation_failed", "MDI linkage key contains another record type");
  }
  if (existingLinkage.value.mdiPatientId !== input.mdiPatientId) {
    return err("stale_transition", "MDI patient linkage did not match case creation input");
  }
  if (existingLinkage.value.mdiCaseId) {
    return ok(existingLinkage.value);
  }

  const linkage: MdiLinkageRecord = {
    ...existingLinkage.value,
    mdiCaseId: input.mdiCaseId,
    updatedAt: input.now,
  };

  const reverseRecord: MdiReverseLookupRecord = {
    ...mdiCaseReverseKey(input.mdiCaseId),
    recordType: "mdiReverseLookup",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    pointerType: "case",
    mdiCaseId: input.mdiCaseId,
    createdAt: input.now,
    updatedAt: input.now,
  };

  const reverseCheck = partitionReverseRecords(repository, [reverseRecord], input.cognitoSub);
  if (!reverseCheck.ok) {
    return reverseCheck;
  }

  const transaction = repository.transactWrite([
    { type: "update", record: linkage, expected: existingLinkage.value },
    ...reverseCheck.value.map((record) => ({
      type: "put" as const,
      record,
      ifNotExists: true,
    })),
  ]);
  if (!transaction.ok) {
    if (transaction.error.kind !== "conditional_conflict") {
      return transaction;
    }
    const reread = repository.get(mdiLinkageKey(input.cognitoSub));
    if (!reread.ok) {
      return reread;
    }
    if (reread.value?.recordType === "mdiLinkage" && reread.value.mdiCaseId) {
      return ok(reread.value);
    }
    return transaction;
  }
  return ok(linkage);
}

export function createMdiCaseCreateAttemptRecord(input: {
  attempts: number;
  cognitoSub: string;
  idempotencyKey: string;
  now: string;
  status: MdiCaseCreateStatus;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  linkedAt?: string;
  submittedAt?: string;
  mdiPatientId?: string;
  mdiCaseId?: string;
  mdiSubmissionId?: string;
  providerStatus?: number;
}): MdiCaseCreateAttemptRecord {
  return {
    ...mdiCaseCreateAttemptKey(input.cognitoSub),
    recordType: "mdiCaseCreateAttempt",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    status: input.status,
    attempts: input.attempts,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.claimExpiresAt ? { claimExpiresAt: input.claimExpiresAt } : {}),
    ...(input.lastAttemptAt ? { lastAttemptAt: input.lastAttemptAt } : {}),
    ...(input.linkedAt ? { linkedAt: input.linkedAt } : {}),
    ...(input.submittedAt ? { submittedAt: input.submittedAt } : {}),
    ...(input.mdiPatientId ? { mdiPatientId: input.mdiPatientId } : {}),
    ...(input.mdiCaseId ? { mdiCaseId: input.mdiCaseId } : {}),
    ...(input.mdiSubmissionId ? { mdiSubmissionId: input.mdiSubmissionId } : {}),
    ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}),
  };
}

export function linkStripeCustomer(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
    billingStatus: BillingStatus;
    allowedCurrentBillingStatuses?: BillingStatus[];
    stripeCurrentPeriodEnd?: string;
    stripeCurrentPeriodStart?: string;
    stripeBillingStatusObservedAt?: string;
    now: string;
  },
): AppDataResult<StripeLinkageRecord> {
  const existingLinkage = repository.get(stripeLinkageKey(input.cognitoSub));
  if (!existingLinkage.ok) {
    return existingLinkage;
  }
  if (existingLinkage.value && existingLinkage.value.recordType !== "stripeLinkage") {
    return err("validation_failed", "Stripe linkage key contains another record type");
  }
  if (
    existingLinkage.value &&
    input.allowedCurrentBillingStatuses &&
    !input.allowedCurrentBillingStatuses.includes(existingLinkage.value.billingStatus)
  ) {
    return err("stale_transition", "Stripe linkage billing status changed before update");
  }

  const linkage: StripeLinkageRecord = {
    ...stripeLinkageKey(input.cognitoSub),
    recordType: "stripeLinkage",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    billingStatus: input.billingStatus,
    stripeBillingStatusObservedAt: input.stripeBillingStatusObservedAt,
    stripeCurrentPeriodStart: input.stripeCurrentPeriodStart,
    stripeCurrentPeriodEnd: input.stripeCurrentPeriodEnd,
    createdAt: existingLinkage.value?.createdAt ?? input.now,
    updatedAt: input.now,
  };

  const reverseRecords: StripeReverseLookupRecord[] = [
    {
      ...stripeCustomerReverseKey(input.stripeCustomerId),
      recordType: "stripeReverseLookup",
      schemaVersion: 1,
      cognitoSub: input.cognitoSub,
      pointerType: "customer",
      stripeCustomerId: input.stripeCustomerId,
      createdAt: input.now,
      updatedAt: input.now,
    },
  ];

  if (input.stripeSubscriptionId) {
    reverseRecords.push({
      ...stripeSubscriptionReverseKey(input.stripeSubscriptionId),
      recordType: "stripeReverseLookup",
      schemaVersion: 1,
      cognitoSub: input.cognitoSub,
      pointerType: "subscription",
      stripeSubscriptionId: input.stripeSubscriptionId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  const reverseCheck = partitionReverseRecords(
    repository,
    reverseRecords,
    input.cognitoSub,
  );
  if (!reverseCheck.ok) {
    return reverseCheck;
  }

  const staleDeletes = existingLinkage.value
    ? collectStaleStripeReverseDeletes(repository, existingLinkage.value, linkage)
    : ok([]);
  if (!staleDeletes.ok) {
    return staleDeletes;
  }

  const transaction = repository.transactWrite([
    existingLinkage.value
      ? { type: "update", record: linkage, expected: existingLinkage.value }
      : { type: "put", record: linkage, ifNotExists: true },
    ...staleDeletes.value,
    ...reverseCheck.value.map((record) => ({
      type: "put" as const,
      record,
      ifNotExists: true,
    })),
  ]);

  return transaction.ok ? ok(linkage) : transaction;
}

export function findPatientByMdiPointer(
  repository: AppDataRepository,
  pointer:
    | { pointerType: "patient"; mdiPatientId: string }
    | { pointerType: "case"; mdiCaseId: string },
): AppDataResult<string | null> {
  const key =
    pointer.pointerType === "patient"
      ? mdiPatientReverseKey(pointer.mdiPatientId)
      : mdiCaseReverseKey(pointer.mdiCaseId);

  return findPatientByReverseKey(repository, key, "mdiReverseLookup");
}

export function findPatientByStripePointer(
  repository: AppDataRepository,
  pointer:
    | { pointerType: "customer"; stripeCustomerId: string }
    | { pointerType: "subscription"; stripeSubscriptionId: string },
): AppDataResult<string | null> {
  const key =
    pointer.pointerType === "customer"
      ? stripeCustomerReverseKey(pointer.stripeCustomerId)
      : stripeSubscriptionReverseKey(pointer.stripeSubscriptionId);

  return findPatientByReverseKey(repository, key, "stripeReverseLookup");
}

export function listEvidenceEventsForPatient(
  repository: AppDataRepository,
  input: { cognitoSub: string; limit?: number; exclusiveStartKey?: AppDataKey },
): AppDataResult<{ items: EvidenceEventRecord[]; nextKey?: AppDataKey }> {
  if (!isCognitoSub(input.cognitoSub)) {
    return err("validation_failed", "Invalid evidence timeline subject");
  }

  const limit = normalizeEvidenceEventLimit(input.limit);
  if (!limit.ok) {
    return limit;
  }

  const records = repository.queryByKeyPrefix({
    pk: patientProfileKey(input.cognitoSub).pk,
    skPrefix: "EVIDENCE#",
    limit: limit.value,
    exclusiveStartKey: input.exclusiveStartKey,
  });
  if (!records.ok) {
    return records;
  }

  const events: EvidenceEventRecord[] = [];
  for (const record of records.value.items) {
    if (record.recordType !== "evidenceEvent") {
      return err("validation_failed", "Evidence timeline contained another record type");
    }
    events.push(record);
  }

  return ok({ items: events, nextKey: records.value.nextKey });
}

export function listEvidenceEventsForMdiCase(
  repository: AppDataRepository,
  input: {
    mdiCaseId: string;
    cognitoSub?: string;
    limit?: number;
    exclusiveStartKey?: AppDataKey;
  },
): AppDataResult<{
  cognitoSub: string;
  items: EvidenceEventRecord[];
  nextKey?: AppDataKey;
} | null> {
  if (!isMdiCaseId(input.mdiCaseId)) {
    return err("validation_failed", "Invalid evidence case lookup ID");
  }

  const limit = normalizeEvidenceEventLimit(input.limit);
  if (!limit.ok) {
    return limit;
  }

  let cognitoSub = input.cognitoSub;
  if (cognitoSub !== undefined) {
    if (!isCognitoSub(cognitoSub)) {
      return err("validation_failed", "Invalid evidence case continuation subject");
    }
    const patient = findPatientByMdiPointer(repository, {
      pointerType: "case",
      mdiCaseId: input.mdiCaseId,
    });
    if (!patient.ok) {
      return patient;
    }
    if (patient.value !== cognitoSub) {
      return err("validation_failed", "Evidence case continuation subject did not match case");
    }
  } else {
    const patient = findPatientByMdiPointer(repository, {
      pointerType: "case",
      mdiCaseId: input.mdiCaseId,
    });
    if (!patient.ok) {
      return patient;
    }
    if (!patient.value) {
      return ok(null);
    }
    cognitoSub = patient.value;
  }

  const caseIndexPk = mdiCaseReverseKey(input.mdiCaseId).pk;
  if (
    input.exclusiveStartKey !== undefined &&
    (
      input.exclusiveStartKey.pk !== caseIndexPk ||
      !input.exclusiveStartKey.sk.startsWith("EVIDENCE#")
    )
  ) {
    return err("validation_failed", "Invalid evidence case cursor");
  }

  const pointers = repository.queryByKeyPrefix({
    pk: caseIndexPk,
    skPrefix: "EVIDENCE#",
    limit: limit.value,
    exclusiveStartKey: input.exclusiveStartKey,
  });
  if (!pointers.ok) {
    return pointers;
  }

  const caseEvents: EvidenceEventRecord[] = [];
  for (const pointer of pointers.value.items) {
    if (pointer.recordType !== "evidenceCaseIndex") {
      return err("validation_failed", "Evidence case timeline contained another record type");
    }
    if (pointer.cognitoSub !== cognitoSub || pointer.mdiCaseId !== input.mdiCaseId) {
      return err("validation_failed", "Evidence case pointer did not match lookup");
    }

    const event = repository.get({ pk: pointer.evidencePk, sk: pointer.evidenceSk });
    if (!event.ok) {
      return event;
    }
    if (!event.value) {
      return err("validation_failed", "Evidence case pointer target was missing");
    }
    if (event.value.recordType !== "evidenceEvent") {
      return err("validation_failed", "Evidence case pointer targeted another record type");
    }
    if (
      event.value.cognitoSub !== pointer.cognitoSub ||
      event.value.mdiCaseId !== pointer.mdiCaseId ||
      event.value.eventId !== pointer.eventId
    ) {
      return err("validation_failed", "Evidence case pointer target did not match pointer");
    }

    caseEvents.push(event.value);
  }

  return ok({
    cognitoSub,
    items: caseEvents,
    nextKey: pointers.value.nextKey,
  });
}

export function recordConsentEvidence(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    consentKind: ConsentKind;
    version: string;
    acceptedAt: string;
    now: string;
    ipHash?: string;
    userAgentHash?: string;
  },
): AppDataResult<ConsentEvidenceRecord> {
  const record = createConsentEvidenceRecord(input);

  return repository.put(record);
}

export function recordCurrentConsentAcceptance(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    acceptedAt: string;
    now: string;
    ipHash?: string;
    requiredConsents?: readonly RequiredConsentDocument[];
    userAgentHash?: string;
  },
): AppDataResult<ConsentEvidenceRecord[]> {
  const requiredConsents = input.requiredConsents ?? currentRequiredConsents;
  const records = requiredConsents.map((consent) => createConsentEvidenceRecord({
    acceptedAt: input.acceptedAt,
    cognitoSub: input.cognitoSub,
    consentKind: consent.consentKind,
    ipHash: input.ipHash,
    now: input.now,
    userAgentHash: input.userAgentHash,
    version: consent.version,
  }));
  const writes: TransactWriteOperation[] = [];
  const acceptedRecords: ConsentEvidenceRecord[] = [];

  for (const record of records) {
    const existing = repository.get(record);
    if (!existing.ok) {
      return existing;
    }
    if (existing.value) {
      if (existing.value.recordType !== "consentEvidence") {
        return err("validation_failed", "Consent key contains another record type");
      }
      acceptedRecords.push(existing.value);
      continue;
    }

    writes.push({ type: "put", record, ifNotExists: true });
    acceptedRecords.push(record);
  }

  if (writes.length === 0) {
    return ok(acceptedRecords);
  }

  const result = repository.transactWrite(writes);
  return result.ok ? ok(acceptedRecords) : result;
}

export function createConsentEvidenceRecord(input: {
  cognitoSub: string;
  consentKind: ConsentKind;
  version: string;
  acceptedAt: string;
  now: string;
  ipHash?: string;
  userAgentHash?: string;
}): ConsentEvidenceRecord {
  return {
    ...consentEvidenceKey(input.cognitoSub, input.consentKind, input.version),
    recordType: "consentEvidence",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    consentKind: input.consentKind,
    version: input.version,
    acceptedAt: input.acceptedAt,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function claimWebhookEvent(
  repository: AppDataRepository,
  input: {
    provider: WebhookProvider;
    eventId: string;
    now: string;
    deliverySource?: "provider" | "queue";
    expectedAttempts?: number;
    processingLeaseSeconds?: number;
    maxAttempts?: number;
  },
): AppDataResult<WebhookClaimOutcome> {
  if (!isWebhookEventIdForProvider(input.provider, input.eventId)) {
    return err("validation_failed", "Invalid webhook event ID");
  }

  const key = webhookIdempotencyKey(input.provider, input.eventId);
  const processingExpiresAt = addSecondsIso(input.now, input.processingLeaseSeconds ?? 300);
  const existing = repository.get(key);
  if (!existing.ok) {
    return existing;
  }

  if (existing.value) {
    const record = existing.value as WebhookIdempotencyRecord;
    if (record.status === "processing") {
      if (record.processingExpiresAt && isAtOrBefore(record.processingExpiresAt, input.now)) {
        if (record.maxAttempts !== undefined && record.attempts >= record.maxAttempts) {
          const exhaustedRecord: WebhookIdempotencyRecord = {
            ...record,
            status: "failed",
            retryable: false,
            retryOwner: undefined,
            processingExpiresAt: undefined,
            nextAttemptAfter: undefined,
            retryExhaustedAt: record.retryExhaustedAt ?? input.now,
            updatedAt: input.now,
          };
          const exhausted = repository.update(exhaustedRecord, { expected: record });
          if (!exhausted.ok) {
            return exhausted.error.kind === "conditional_conflict"
              ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
              : exhausted;
          }
          return ok({ outcome: "retryExhausted", record: exhausted.value });
        }
        const retryRecord: WebhookIdempotencyRecord = {
          ...record,
          status: "processing",
          retryable: false,
          retryOwner: undefined,
          attempts: record.attempts + 1,
          processingExpiresAt,
          nextAttemptAfter: undefined,
          maxAttempts: record.maxAttempts ?? input.maxAttempts,
          updatedAt: input.now,
        };
        const claimed = repository.update(retryRecord, { expected: record });
        if (!claimed.ok) {
          return claimed.error.kind === "conditional_conflict"
            ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
            : claimed;
        }
        return ok({ outcome: "processingLeaseExpired", record: claimed.value });
      }
      return ok({ outcome: "alreadyProcessing", record });
    }
    if (record.status === "processed") {
      return ok({ outcome: "alreadyProcessed", record });
    }
    if (record.retryable) {
      if (
        input.deliverySource === "queue" &&
        (record.retryOwner !== "queue" ||
          input.expectedAttempts === undefined ||
          record.attempts !== input.expectedAttempts)
      ) {
        return ok({ outcome: "staleQueueDelivery", record });
      }
      if (record.retryOwner === "queue" && input.deliverySource !== "queue") {
        return ok({ outcome: "queueOwnedRetry", record });
      }
      if (
        record.retryOwner !== "queue" &&
        record.maxAttempts !== undefined &&
        record.attempts >= record.maxAttempts
      ) {
        const exhaustedRecord: WebhookIdempotencyRecord = {
          ...record,
          status: "failed",
          retryable: false,
          retryOwner: undefined,
          processingExpiresAt: undefined,
          nextAttemptAfter: undefined,
          retryExhaustedAt: record.retryExhaustedAt ?? input.now,
          updatedAt: input.now,
        };
        const exhausted = repository.update(exhaustedRecord, { expected: record });
        if (!exhausted.ok) {
          return exhausted.error.kind === "conditional_conflict"
            ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
            : exhausted;
        }
        return ok({ outcome: "retryExhausted", record: exhausted.value });
      }
      if (
        record.nextAttemptAfter &&
        input.deliverySource !== "queue" &&
        isAfter(record.nextAttemptAfter, input.now)
      ) {
        return ok({ outcome: "retryNotDue", record });
      }
      const retryRecord: WebhookIdempotencyRecord = {
        ...record,
        status: "processing",
        retryable: false,
        retryOwner: undefined,
        attempts: record.attempts + 1,
        processingExpiresAt,
        nextAttemptAfter: undefined,
        maxAttempts: record.maxAttempts ?? input.maxAttempts,
        updatedAt: input.now,
      };
      const claimed = repository.update(retryRecord, { expected: record });
      if (!claimed.ok) {
        return claimed.error.kind === "conditional_conflict"
          ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
          : claimed;
      }
      return ok({ outcome: "failedRetryable", record: claimed.value });
    }
    return ok({ outcome: "conflict", record });
  }

  const record: WebhookIdempotencyRecord = {
    ...key,
    recordType: "webhookIdempotency",
    schemaVersion: 1,
    provider: input.provider,
    eventId: input.eventId,
    status: "processing",
    retryable: false,
    attempts: 1,
    processingExpiresAt,
    maxAttempts: input.maxAttempts,
    createdAt: input.now,
    updatedAt: input.now,
  };

  const claimed = repository.put(record, { ifNotExists: true });
  if (!claimed.ok) {
    return claimed.error.kind === "conditional_conflict"
      ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
      : claimed;
  }

  return ok({ outcome: "claimed", record });
}

export function markWebhookEventStatus(
  repository: AppDataRepository,
  input: {
    provider: WebhookProvider;
    eventId: string;
    status: WebhookProcessingStatus;
    retryable: boolean;
    now: string;
    expectedAttempts?: number;
    expectedProcessingExpiresAt?: string;
    retryOwner?: "provider" | "queue" | "handoff";
    nextAttemptAfter?: string;
    maxAttempts?: number;
  },
): AppDataResult<WebhookIdempotencyRecord> {
  const existing = repository.get(webhookIdempotencyKey(input.provider, input.eventId));
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value || existing.value.recordType !== "webhookIdempotency") {
    return err("not_found", "Webhook event has not been claimed");
  }
  const isCurrentProcessingClaim = existing.value.status === "processing";
  const isRetryOwnerTransition =
    existing.value.status === "failed" &&
    existing.value.retryable &&
    (existing.value.retryOwner === "provider" || existing.value.retryOwner === "handoff") &&
    input.status === "failed" &&
    input.retryable &&
    (input.retryOwner === "queue" || input.retryOwner === "provider");

  if (
    (!isCurrentProcessingClaim && !isRetryOwnerTransition) ||
    (isCurrentProcessingClaim &&
      existing.value.processingExpiresAt !== undefined &&
      isAtOrBefore(existing.value.processingExpiresAt, input.now)) ||
    (input.expectedAttempts !== undefined &&
      existing.value.attempts !== input.expectedAttempts) ||
    (isCurrentProcessingClaim &&
      input.expectedProcessingExpiresAt !== undefined &&
      existing.value.processingExpiresAt !== input.expectedProcessingExpiresAt)
  ) {
    return err("stale_webhook_claim", "Webhook claim is no longer current");
  }

  const record: WebhookIdempotencyRecord = {
    ...existing.value,
    status: input.status,
    retryable: input.retryable,
    retryOwner: input.retryable ? (input.retryOwner ?? "provider") : undefined,
    processingExpiresAt: input.status === "processing"
      ? existing.value.processingExpiresAt
      : undefined,
    nextAttemptAfter: input.nextAttemptAfter,
    maxAttempts: input.maxAttempts ?? existing.value.maxAttempts,
    updatedAt: input.now,
  };

  return repository.update(record, { expected: existing.value });
}

export function createEvidenceEventRecord(input: {
  cognitoSub: string;
  eventId: string;
  eventType: EvidenceEventType;
  eventCategory: EvidenceEventCategory;
  occurredAt: string;
  recordedAt: string;
  actorType: EvidenceActorType;
  status: EvidenceEventStatus;
  summaryCode: string;
  mdiPatientId?: string;
  mdiCaseId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  webhookProvider?: WebhookProvider;
  webhookEventId?: string;
  requestId?: string;
  adminActorId?: string;
  source?: string;
  metadata?: EvidenceEventMetadata;
}): EvidenceEventRecord {
  return {
    ...evidenceEventKey(input.cognitoSub, input.occurredAt, input.eventId),
    recordType: "evidenceEvent",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    eventId: input.eventId,
    eventType: input.eventType,
    eventCategory: input.eventCategory,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
    actorType: input.actorType,
    status: input.status,
    summaryCode: input.summaryCode,
    ...(input.mdiPatientId === undefined ? {} : { mdiPatientId: input.mdiPatientId }),
    ...(input.mdiCaseId === undefined ? {} : { mdiCaseId: input.mdiCaseId }),
    ...(input.stripeCustomerId === undefined ? {} : {
      stripeCustomerId: input.stripeCustomerId,
    }),
    ...(input.stripeSubscriptionId === undefined ? {} : {
      stripeSubscriptionId: input.stripeSubscriptionId,
    }),
    ...(input.webhookProvider === undefined ? {} : { webhookProvider: input.webhookProvider }),
    ...(input.webhookEventId === undefined ? {} : { webhookEventId: input.webhookEventId }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.adminActorId === undefined ? {} : { adminActorId: input.adminActorId }),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    createdAt: input.recordedAt,
    updatedAt: input.recordedAt,
  };
}

export function createEvidenceCaseIndexRecord(
  record: EvidenceEventRecord,
): EvidenceCaseIndexRecord | null {
  if (record.mdiCaseId === undefined) {
    return null;
  }

  return {
    ...evidenceCaseIndexKey(record.mdiCaseId, record.occurredAt, record.eventId),
    recordType: "evidenceCaseIndex",
    schemaVersion: 1,
    cognitoSub: record.cognitoSub,
    mdiCaseId: record.mdiCaseId,
    eventId: record.eventId,
    evidencePk: record.pk,
    evidenceSk: record.sk,
    createdAt: record.recordedAt,
    updatedAt: record.recordedAt,
  };
}

export function createEvidenceEventWriteOperations(
  record: EvidenceEventRecord,
): AppDataResult<{
  operations: TransactWriteOperation[];
  uniquenessKey: AppDataKey;
}> {
  const validation = validateAppDataRecord(record);
  if (!validation.ok) {
    return validation;
  }

  const uniquenessKey = record.eventCategory === "webhook"
    ? evidenceEventUniquenessKey(record.eventId)
    : patientEvidenceEventUniquenessKey(record.cognitoSub, record.eventId);
  const uniqueness: EvidenceEventUniquenessRecord = {
    ...uniquenessKey,
    recordType: "evidenceEventUniqueness",
    schemaVersion: 1,
    cognitoSub: record.cognitoSub,
    eventId: record.eventId,
    evidencePk: record.pk,
    evidenceSk: record.sk,
    createdAt: record.recordedAt,
    updatedAt: record.recordedAt,
  };
  const caseIndex = createEvidenceCaseIndexRecord(record);
  const operations: TransactWriteOperation[] = [
    { type: "put", record: uniqueness, ifNotExists: true },
    { type: "put", record, ifNotExists: true },
  ];

  if (caseIndex) {
    operations.push({ type: "put", record: caseIndex, ifNotExists: true });
  }

  return ok({ operations, uniquenessKey });
}

export function recordEvidenceEvent(
  repository: AppDataRepository,
  input: Parameters<typeof createEvidenceEventRecord>[0],
): AppDataResult<EvidenceEventRecord> {
  const record = createEvidenceEventRecord(input);
  const writes = createEvidenceEventWriteOperations(record);
  if (!writes.ok) {
    return writes;
  }

  const written = repository.transactWrite(writes.value.operations);

  if (written.ok) {
    return ok(record);
  }
  if (record.eventCategory !== "webhook" || written.error.kind !== "conditional_conflict") {
    return written;
  }

  const existingUniqueness = repository.get(writes.value.uniquenessKey);
  if (!existingUniqueness.ok) {
    return existingUniqueness;
  }
  if (existingUniqueness.value?.recordType !== "evidenceEventUniqueness") {
    return written;
  }

  const existing = repository.get({
    pk: existingUniqueness.value.evidencePk,
    sk: existingUniqueness.value.evidenceSk,
  });
  if (!existing.ok) {
    return existing;
  }

  return existing.value?.recordType === "evidenceEvent" &&
    isIdempotentEvidenceReplay(record, existing.value)
    ? ok(existing.value)
    : written;
}

export function recordCurrentMdiCaseStatusEvidence(
  repository: AppDataRepository,
  input: RecordCurrentMdiCaseStatusEvidenceInput,
): AppDataResult<{ applied: boolean; record: EvidenceEventRecord }> {
  const record = createEvidenceEventRecord(input);
  const writes = createEvidenceEventWriteOperations(record);
  if (!writes.ok) {
    return writes;
  }
  if (
    record.mdiCaseId === undefined ||
    record.mdiPatientId === undefined ||
    record.webhookEventId === undefined
  ) {
    return err("validation_failed", "MDI case status evidence is missing linkage");
  }

  const mirrorKey = mdiCaseStatusMirrorKey(record.mdiCaseId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = repository.get(mirrorKey);
    if (!existing.ok) {
      return existing;
    }
    if (existing.value && existing.value.recordType !== "mdiCaseStatusMirror") {
      return err("validation_failed", "MDI case status mirror key contains another record type");
    }
    if (existing.value?.webhookEventId === record.webhookEventId) {
      return ok({ applied: false, record });
    }
    if (existing.value && !isIncomingMdiCaseStatusCurrent(existing.value, input)) {
      return err("stale_transition", "MDI case status mirror is newer than incoming event");
    }

    const mirror: MdiCaseStatusMirrorRecord = {
      ...mirrorKey,
      recordType: "mdiCaseStatusMirror",
      schemaVersion: 1,
      caseStatus: input.caseStatus,
      cognitoSub: record.cognitoSub,
      createdAt: existing.value?.createdAt ?? record.recordedAt,
      mdiCaseId: record.mdiCaseId,
      mdiPatientId: record.mdiPatientId,
      providerTimestamp: record.occurredAt,
      statusRank: input.statusRank,
      terminal: input.terminal,
      updatedAt: record.recordedAt,
      webhookEventId: record.webhookEventId,
    };
    const reconciliationIndex: MdiCaseStatusReconciliationIndexRecord = {
      ...mdiCaseStatusReconciliationIndexKey(record.mdiCaseId),
      recordType: "mdiCaseStatusReconciliationIndex",
      schemaVersion: 1,
      caseStatus: input.caseStatus,
      cognitoSub: record.cognitoSub,
      createdAt: existing.value?.createdAt ?? record.recordedAt,
      mdiCaseId: record.mdiCaseId,
      mdiPatientId: record.mdiPatientId,
      providerTimestamp: record.occurredAt,
      statusRank: input.statusRank,
      terminal: input.terminal,
      updatedAt: record.recordedAt,
      webhookEventId: record.webhookEventId,
    };

    const written = repository.transactWrite([
      existing.value
        ? { type: "update", record: mirror, expected: existing.value }
        : { type: "put", record: mirror, ifNotExists: true },
      input.terminal
        ? { type: "delete", key: mdiCaseStatusReconciliationIndexKey(record.mdiCaseId) }
        : { type: "put", record: reconciliationIndex },
      ...writes.value.operations,
    ]);
    if (written.ok) {
      return ok({ applied: true, record });
    }
    if (written.error.kind !== "conditional_conflict") {
      return written;
    }
  }

  return err("conditional_conflict", "MDI case status mirror update conflicted");
}

export function listMdiCaseStatusReconciliationItems(
  repository: Pick<AppDataRepository, "queryByKeyPrefix">,
  input: {
    exclusiveStartKey?: AppDataKey;
    includeTerminal?: boolean;
    limit?: number;
  } = {},
): AppDataResult<{
  items: MdiCaseStatusReconciliationIndexRecord[];
  nextKey?: AppDataKey;
}> {
  const limit = input.limit ?? 100;
  const queried = repository.queryByKeyPrefix({
    pk: mdiCaseStatusReconciliationIndexPk,
    skPrefix: "CASE#",
    limit,
    exclusiveStartKey: input.exclusiveStartKey,
  });
  if (!queried.ok) {
    return queried;
  }

  const items: MdiCaseStatusReconciliationIndexRecord[] = [];
  for (const record of queried.value.items) {
    if (record.recordType !== "mdiCaseStatusReconciliationIndex") {
      return err("validation_failed", "MDI case status reconciliation index contained another record type");
    }
    if (!input.includeTerminal && record.terminal) {
      return err("validation_failed", "Terminal MDI case status record found in active reconciliation index");
    }
    items.push(record);
  }

  return ok({ items, nextKey: queried.value.nextKey });
}

function isIncomingMdiCaseStatusCurrent(
  current: MdiCaseStatusMirrorRecord,
  incoming: {
    occurredAt: string;
    statusRank: number;
    terminal: boolean;
  },
) {
  const incomingTime = Date.parse(incoming.occurredAt);
  const currentTime = Date.parse(current.providerTimestamp);
  if (!Number.isFinite(incomingTime) || !Number.isFinite(currentTime)) {
    return false;
  }
  if (incomingTime < currentTime) {
    return false;
  }
  if (current.terminal && !incoming.terminal) {
    return false;
  }
  if (incomingTime === currentTime && incoming.statusRank < current.statusRank) {
    return false;
  }
  return !(current.statusRank >= 30 && incoming.statusRank < current.statusRank && !incoming.terminal);
}

export function transitionOnboardingStatus(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    expected: OnboardingStatus;
    next: OnboardingStatus;
    now: string;
  },
): AppDataResult<PatientProfileRecord> {
  const existing = repository.get(patientProfileKey(input.cognitoSub));
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value || existing.value.recordType !== "patientProfile") {
    return err("not_found", "Patient profile was not found");
  }
  if (existing.value.onboardingStatus !== input.expected) {
    return err("stale_transition", "Onboarding status did not match expected state");
  }

  const record: PatientProfileRecord = {
    ...existing.value,
    onboardingStatus: input.next,
    updatedAt: input.now,
  };

  return repository.update(record, { expected: existing.value });
}

export function completeIntakePrecheckProfile(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    now: string;
    residencyState: UsStateCode;
  },
): AppDataResult<PatientProfileRecord> {
  const existing = repository.get(patientProfileKey(input.cognitoSub));
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value) {
    const created = createPatientProfileRecord({
      cognitoSub: input.cognitoSub,
      now: input.now,
      onboardingStatus: "intake_ready",
      residencyState: input.residencyState,
    });
    const put = repository.put(created, { ifNotExists: true });
    return put.ok || put.error.kind !== "conditional_conflict"
      ? put
      : readCompletedIntakePrecheckProfile(repository, input);
  }
  if (existing.value.recordType !== "patientProfile") {
    return err("validation_failed", "Patient profile key contains another record type");
  }
  if (
    existing.value.onboardingStatus !== "profile_pending" &&
    existing.value.onboardingStatus !== "intake_ready"
  ) {
    return ok(existing.value);
  }
  if (
    existing.value.onboardingStatus === "intake_ready" &&
    existing.value.residencyState === input.residencyState
  ) {
    return ok(existing.value);
  }
  if (
    existing.value.onboardingStatus === "intake_ready" &&
    existing.value.residencyState &&
    existing.value.residencyState !== input.residencyState
  ) {
    return err("stale_transition", "Residency state did not match existing intake-ready profile");
  }

  const next: PatientProfileRecord = {
    ...existing.value,
    onboardingStatus: "intake_ready",
    residencyState: input.residencyState,
    updatedAt: input.now,
  };
  const updated = repository.update(next, { expected: existing.value });
  return updated.ok || updated.error.kind !== "conditional_conflict"
    ? updated
    : readCompletedIntakePrecheckProfile(repository, input);
}

function readCompletedIntakePrecheckProfile(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    residencyState: UsStateCode;
  },
): AppDataResult<PatientProfileRecord> {
  const reread = repository.get(patientProfileKey(input.cognitoSub));
  if (!reread.ok) {
    return reread;
  }
  if (!reread.value || reread.value.recordType !== "patientProfile") {
    return err("conditional_conflict", "Intake profile write conflicted but no profile could be read");
  }
  if (
    reread.value.onboardingStatus === "intake_ready" &&
    reread.value.residencyState === input.residencyState
  ) {
    return ok(reread.value);
  }
  return err("conditional_conflict", "Intake profile write conflicted before residency was current");
}

export function validateAppDataRecord(
  record: unknown,
): AppDataResult<AppDataRecord> {
  if (!isRecord(record)) {
    return err("validation_failed", "Record must be an object");
  }

  const forbidden = findForbiddenField(record);
  if (forbidden) {
    return err("validation_failed", `Forbidden clinical field: ${forbidden}`);
  }

  const recordType = record.recordType;
  if (typeof recordType !== "string") {
    return err("validation_failed", "Record is missing recordType");
  }

  const allowed = allowedFields[recordType];
  if (!allowed) {
    return err("validation_failed", `Unknown record type: ${recordType}`);
  }

  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return err("validation_failed", `Unknown field for ${recordType}: ${key}`);
    }
  }

  if (
    typeof record.pk !== "string" ||
    typeof record.sk !== "string" ||
    record.schemaVersion !== 1 ||
    !isIsoTimestamp(record.createdAt) ||
    !isIsoTimestamp(record.updatedAt)
  ) {
    return err("validation_failed", "Record is missing required base fields");
  }

  return validateByType(record as AppDataRecord);
}

function validateByType(record: AppDataRecord): AppDataResult<AppDataRecord> {
  switch (record.recordType) {
    case "patientProfile":
      return typeof record.cognitoSub === "string" &&
        isOnboardingStatus(record.onboardingStatus) &&
        optionalUsStateCode(record.residencyState) &&
        keysMatch(record, patientProfileKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid patient profile record");
    case "mdiLinkage":
      return typeof record.cognitoSub === "string" &&
        typeof record.mdiPatientId === "string" &&
        isMdiPatientId(record.mdiPatientId) &&
        optionalMdiCaseId(record.mdiCaseId) &&
        keysMatch(record, mdiLinkageKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid MDI linkage record");
    case "mdiReverseLookup":
      return validateMdiReverse(record);
    case "mdiPatientCreateAttempt":
      return typeof record.cognitoSub === "string" &&
        isMdiPatientCreateStatus(record.status) &&
        Number.isInteger(record.attempts) &&
        record.attempts >= 0 &&
        typeof record.idempotencyKey === "string" &&
        record.idempotencyKey.length > 0 &&
        optionalIsoDate(record.claimExpiresAt) &&
        optionalIsoDate(record.lastAttemptAt) &&
        optionalIsoDate(record.linkedAt) &&
        optionalPositiveInteger(record.retryAfterSeconds) &&
        optionalHttpStatus(record.providerStatus) &&
        optionalString(record.mdiPatientId) &&
        keysMatch(record, mdiPatientCreateAttemptKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid MDI patient create attempt record");
    case "mdiCaseCreateAttempt":
      return typeof record.cognitoSub === "string" &&
        isCognitoSub(record.cognitoSub) &&
        isMdiCaseCreateStatus(record.status) &&
        Number.isInteger(record.attempts) &&
        record.attempts >= 0 &&
        typeof record.idempotencyKey === "string" &&
        record.idempotencyKey.length > 0 &&
        optionalIsoDate(record.claimExpiresAt) &&
        optionalIsoDate(record.lastAttemptAt) &&
        optionalIsoDate(record.linkedAt) &&
        optionalIsoDate(record.submittedAt) &&
        optionalHttpStatus(record.providerStatus) &&
        optionalMdiPatientId(record.mdiPatientId) &&
        optionalMdiCaseId(record.mdiCaseId) &&
        optionalMdiSubmissionId(record.mdiSubmissionId) &&
        keysMatch(record, mdiCaseCreateAttemptKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid MDI case create attempt record");
    case "mdiCaseStatusMirror":
      return typeof record.cognitoSub === "string" &&
        isCognitoSub(record.cognitoSub) &&
        isMdiPatientId(record.mdiPatientId) &&
        isMdiCaseId(record.mdiCaseId) &&
        isMdiMirroredCaseStatus(record.caseStatus) &&
        isWebhookEventIdForProvider("mdi", record.webhookEventId) &&
        optionalIsoDate(record.providerTimestamp) &&
        typeof record.statusRank === "number" &&
        Number.isInteger(record.statusRank) &&
        record.statusRank >= 0 &&
        typeof record.terminal === "boolean" &&
        keysMatch(record, mdiCaseStatusMirrorKey(record.mdiCaseId))
        ? ok(record)
        : err("validation_failed", "Invalid MDI case status mirror record");
    case "mdiCaseStatusReconciliationIndex":
      return typeof record.cognitoSub === "string" &&
        isCognitoSub(record.cognitoSub) &&
        isMdiPatientId(record.mdiPatientId) &&
        isMdiCaseId(record.mdiCaseId) &&
        isMdiMirroredCaseStatus(record.caseStatus) &&
        isWebhookEventIdForProvider("mdi", record.webhookEventId) &&
        optionalIsoDate(record.providerTimestamp) &&
        typeof record.statusRank === "number" &&
        Number.isInteger(record.statusRank) &&
        record.statusRank >= 0 &&
        typeof record.terminal === "boolean" &&
        keysMatch(record, mdiCaseStatusReconciliationIndexKey(record.mdiCaseId))
        ? ok(record)
        : err("validation_failed", "Invalid MDI case status reconciliation index record");
    case "stripeLinkage":
      return typeof record.cognitoSub === "string" &&
        typeof record.stripeCustomerId === "string" &&
        optionalString(record.stripeSubscriptionId) &&
        isBillingStatus(record.billingStatus) &&
        optionalIsoDate(record.stripeBillingStatusObservedAt) &&
        optionalIsoDate(record.stripeCurrentPeriodStart) &&
        optionalIsoDate(record.stripeCurrentPeriodEnd) &&
        keysMatch(record, stripeLinkageKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid Stripe linkage record");
    case "stripeReverseLookup":
      return validateStripeReverse(record);
    case "consentEvidence":
      return typeof record.cognitoSub === "string" &&
        isConsentKind(record.consentKind) &&
        typeof record.version === "string" &&
        isConsentVersion(record.version) &&
        typeof record.acceptedAt === "string" &&
        optionalHash(record.ipHash) &&
        optionalHash(record.userAgentHash) &&
        keysMatch(record, consentEvidenceKey(
          record.cognitoSub,
          record.consentKind,
          record.version,
        ))
        ? ok(record)
        : err("validation_failed", "Invalid consent evidence record");
    case "webhookIdempotency":
      return (record.provider === "stripe" || record.provider === "mdi") &&
        isWebhookEventIdForProvider(record.provider, record.eventId) &&
        isWebhookStatus(record.status) &&
        typeof record.retryable === "boolean" &&
        Number.isInteger(record.attempts) &&
        record.attempts >= 0 &&
        optionalRetryOwner(record.retryOwner) &&
        optionalIsoDate(record.processingExpiresAt) &&
        optionalIsoDate(record.nextAttemptAfter) &&
        optionalPositiveInteger(record.maxAttempts) &&
        optionalIsoDate(record.retryExhaustedAt) &&
        keysMatch(record, webhookIdempotencyKey(record.provider, record.eventId))
        ? ok(record)
        : err("validation_failed", "Invalid webhook idempotency record");
    case "evidenceEvent":
      return validateEvidenceEvent(record);
    case "evidenceEventUniqueness":
      return validateEvidenceEventUniqueness(record);
    case "evidenceCaseIndex":
      return validateEvidenceCaseIndex(record);
    case "operationalStatus":
      return typeof record.name === "string" &&
        typeof record.status === "string" &&
        optionalString(record.stage) &&
        optionalString(record.jobName) &&
        optionalIsoDate(record.lastHeartbeatAt) &&
        optionalIsoDate(record.lastScheduledAt) &&
        optionalString(record.lastRequestId) &&
        optionalString(record.lastCursorPk) &&
        optionalString(record.lastCursorSk) &&
        keysMatch(record, operationalStatusKey(record.name))
        ? ok(record)
        : err("validation_failed", "Invalid operational status record");
  }
}

function validateMdiReverse(
  record: MdiReverseLookupRecord,
): AppDataResult<AppDataRecord> {
  if (typeof record.cognitoSub !== "string") {
    return err("validation_failed", "Invalid MDI reverse lookup record");
  }
  if (
    record.pointerType === "patient" &&
    typeof record.mdiPatientId === "string" &&
    record.mdiCaseId === undefined &&
    keysMatch(record, mdiPatientReverseKey(record.mdiPatientId))
  ) {
    return ok(record);
  }
  if (
    record.pointerType === "case" &&
    typeof record.mdiCaseId === "string" &&
    record.mdiPatientId === undefined &&
    keysMatch(record, mdiCaseReverseKey(record.mdiCaseId))
  ) {
    return ok(record);
  }
  return err("validation_failed", "Invalid MDI reverse lookup record");
}

function validateStripeReverse(
  record: StripeReverseLookupRecord,
): AppDataResult<AppDataRecord> {
  if (typeof record.cognitoSub !== "string") {
    return err("validation_failed", "Invalid Stripe reverse lookup record");
  }
  if (
    record.pointerType === "customer" &&
    typeof record.stripeCustomerId === "string" &&
    record.stripeSubscriptionId === undefined &&
    keysMatch(record, stripeCustomerReverseKey(record.stripeCustomerId))
  ) {
    return ok(record);
  }
  if (
    record.pointerType === "subscription" &&
    typeof record.stripeSubscriptionId === "string" &&
    record.stripeCustomerId === undefined &&
    keysMatch(record, stripeSubscriptionReverseKey(record.stripeSubscriptionId))
  ) {
    return ok(record);
  }
  return err("validation_failed", "Invalid Stripe reverse lookup record");
}

function validateEvidenceEvent(
  record: EvidenceEventRecord,
): AppDataResult<AppDataRecord> {
  const schema = isEvidenceEventType(record.eventType)
    ? evidenceEventSchema[record.eventType]
    : null;

  return typeof record.cognitoSub === "string" &&
    isCognitoSub(record.cognitoSub) &&
    schema !== null &&
    isEvidenceEventId(record) &&
    isEvidenceEventCategory(record.eventCategory) &&
    schema.category === record.eventCategory &&
    schema.summaryCode === record.summaryCode &&
    validateWebhookEvidenceIdentity(record) &&
    validateEvidenceLinkage(record) &&
    isIsoTimestamp(record.occurredAt) &&
    isIsoTimestamp(record.recordedAt) &&
    isEvidenceActorType(record.actorType) &&
    isEvidenceEventStatus(record.status) &&
    (schema.statuses as readonly EvidenceEventStatus[]).includes(record.status) &&
    isSummaryCode(record.summaryCode) &&
    optionalMdiPatientId(record.mdiPatientId) &&
    optionalMdiCaseId(record.mdiCaseId) &&
    optionalStripeCustomerId(record.stripeCustomerId) &&
    optionalStripeSubscriptionId(record.stripeSubscriptionId) &&
    (record.webhookProvider === undefined ||
      record.webhookProvider === "stripe" ||
      record.webhookProvider === "mdi") &&
    optionalWebhookEventId(record.webhookEventId) &&
    optionalRequestId(record.requestId) &&
    optionalAdminActorId(record.adminActorId) &&
    optionalSource(record.source) &&
    validateEvidenceMetadata(record.eventType, record.metadata) &&
    keysMatch(
      record,
      evidenceEventKey(record.cognitoSub, record.occurredAt, record.eventId),
    )
    ? ok(record)
    : err("validation_failed", "Invalid evidence event record");
}

function validateWebhookEvidenceIdentity(record: EvidenceEventRecord) {
  if (record.eventCategory !== "webhook") {
    return record.webhookProvider === undefined && record.webhookEventId === undefined;
  }

  return (
    record.webhookProvider !== undefined &&
    record.webhookEventId !== undefined &&
    record.eventId === createWebhookEvidenceEventId(
      record.webhookProvider,
      record.webhookEventId,
      record.summaryCode,
      record.eventType === "webhook_side_effect_applied"
        ? record.metadata?.side_effect
        : undefined,
    )
  );
}

function validateEvidenceLinkage(record: EvidenceEventRecord) {
  const requirement = (
    evidenceEventSchema[record.eventType] as { linkage?: EvidenceLinkageRequirement }
  ).linkage;
  if (requirement === undefined) {
    return true;
  }

  if (requirement === "mdi_case") {
    return record.mdiPatientId !== undefined && record.mdiCaseId !== undefined;
  }
  if (requirement === "mdi_patient") {
    return record.mdiPatientId !== undefined;
  }
  if (requirement === "mdi_failure") {
    return record.requestId !== undefined ||
      record.mdiPatientId !== undefined ||
      record.mdiCaseId !== undefined;
  }
  if (requirement === "stripe_customer") {
    return record.stripeCustomerId !== undefined;
  }
  if (requirement === "stripe_subscription") {
    return record.stripeCustomerId !== undefined &&
      record.stripeSubscriptionId !== undefined;
  }
  if (requirement === "webhook") {
    return record.webhookProvider !== undefined && record.webhookEventId !== undefined;
  }

  if (record.webhookProvider === undefined || record.webhookEventId === undefined) {
    return false;
  }
  if (record.metadata?.side_effect === undefined) {
    return false;
  }
  if (record.metadata?.side_effect === "billing_status_update") {
    return record.stripeCustomerId !== undefined &&
      record.stripeSubscriptionId !== undefined;
  }
  if (record.metadata?.side_effect === "mdi_status_update") {
    return record.mdiPatientId !== undefined && record.mdiCaseId !== undefined;
  }
  return true;
}

function validateEvidenceEventUniqueness(
  record: EvidenceEventUniquenessRecord,
): AppDataResult<AppDataRecord> {
  return typeof record.cognitoSub === "string" &&
    isCognitoSub(record.cognitoSub) &&
    isEvidenceEventIdValue(record.eventId) &&
    typeof record.evidencePk === "string" &&
    typeof record.evidenceSk === "string" &&
    record.evidencePk === `PATIENT#${record.cognitoSub}` &&
    isEvidenceEventPointer(record) &&
    (
      keysMatch(record, evidenceEventUniquenessKey(record.eventId)) ||
      keysMatch(record, patientEvidenceEventUniquenessKey(record.cognitoSub, record.eventId))
    )
    ? ok(record)
    : err("validation_failed", "Invalid evidence event uniqueness record");
}

function validateEvidenceCaseIndex(
  record: EvidenceCaseIndexRecord,
): AppDataResult<AppDataRecord> {
  return typeof record.cognitoSub === "string" &&
    isCognitoSub(record.cognitoSub) &&
    typeof record.mdiCaseId === "string" &&
    isMdiCaseId(record.mdiCaseId) &&
    isEvidenceEventIdValue(record.eventId) &&
    typeof record.evidencePk === "string" &&
    typeof record.evidenceSk === "string" &&
    record.evidencePk === `PATIENT#${record.cognitoSub}` &&
    isEvidenceCaseIndexPointer(record)
    ? ok(record)
    : err("validation_failed", "Invalid evidence case index record");
}

function isEvidenceEventPointer(record: EvidenceEventUniquenessRecord) {
  const suffix = `#${record.eventId}`;
  if (!record.evidenceSk.startsWith("EVIDENCE#") || !record.evidenceSk.endsWith(suffix)) {
    return false;
  }

  const occurredAt = record.evidenceSk.slice("EVIDENCE#".length, -suffix.length);
  return isIsoTimestamp(occurredAt) &&
    record.evidenceSk === evidenceEventKey(
      record.cognitoSub,
      occurredAt,
      record.eventId,
    ).sk;
}

function isEvidenceCaseIndexPointer(record: EvidenceCaseIndexRecord) {
  const suffix = `#${record.eventId}`;
  if (
    !record.sk.startsWith("EVIDENCE#") ||
    !record.sk.endsWith(suffix) ||
    !record.evidenceSk.startsWith("EVIDENCE#") ||
    !record.evidenceSk.endsWith(suffix)
  ) {
    return false;
  }

  const occurredAt = record.sk.slice("EVIDENCE#".length, -suffix.length);
  if (
    !isIsoTimestamp(occurredAt) ||
    record.evidenceSk !== evidenceEventKey(
      record.cognitoSub,
      occurredAt,
      record.eventId,
    ).sk
  ) {
    return false;
  }

  return keysMatch(
    record,
    evidenceCaseIndexKey(record.mdiCaseId, occurredAt, record.eventId),
  );
}

export function isIdempotentEvidenceReplay(
  incoming: EvidenceEventRecord,
  existing: EvidenceEventRecord,
) {
  return incoming.cognitoSub === existing.cognitoSub &&
    incoming.eventId === existing.eventId &&
    incoming.eventType === existing.eventType &&
    incoming.eventCategory === existing.eventCategory &&
    incoming.actorType === existing.actorType &&
    incoming.status === existing.status &&
    incoming.summaryCode === existing.summaryCode &&
    incoming.mdiPatientId === existing.mdiPatientId &&
    incoming.mdiCaseId === existing.mdiCaseId &&
    incoming.stripeCustomerId === existing.stripeCustomerId &&
    incoming.stripeSubscriptionId === existing.stripeSubscriptionId &&
    incoming.webhookProvider === existing.webhookProvider &&
    incoming.webhookEventId === existing.webhookEventId &&
    incoming.adminActorId === existing.adminActorId &&
    incoming.source === existing.source &&
    metadataEqual(incoming.metadata, existing.metadata);
}

function metadataEqual(
  left: EvidenceEventMetadata | undefined,
  right: EvidenceEventMetadata | undefined,
) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right?.[key] === value);
}

function findPatientByReverseKey(
  repository: AppDataRepository,
  key: AppDataKey,
  recordType: "mdiReverseLookup" | "stripeReverseLookup",
): AppDataResult<string | null> {
  const result = repository.get(key);
  if (!result.ok) {
    return result;
  }
  if (!result.value) {
    return ok(null);
  }
  if (result.value.recordType !== recordType) {
    return err("validation_failed", "Reverse lookup record type mismatch");
  }
  return ok(result.value.cognitoSub);
}

function partitionReverseRecords(
  repository: AppDataRepository,
  records: Array<MdiReverseLookupRecord | StripeReverseLookupRecord>,
  cognitoSub: string,
): AppDataResult<Array<MdiReverseLookupRecord | StripeReverseLookupRecord>> {
  const recordsToCreate: Array<MdiReverseLookupRecord | StripeReverseLookupRecord> = [];

  for (const record of records) {
    const existing = repository.get(record);
    if (!existing.ok) {
      return existing;
    }
    if (existing.value && "cognitoSub" in existing.value && existing.value.cognitoSub !== cognitoSub) {
      return err("conditional_conflict", "Vendor pointer already belongs to another patient");
    }
    if (!existing.value) {
      recordsToCreate.push(record);
    }
  }

  return ok(recordsToCreate);
}

function collectStaleMdiReverseDeletes(
  repository: AppDataRepository,
  existing: MdiLinkageRecord,
  next: MdiLinkageRecord,
): AppDataResult<TransactWriteOperation[]> {
  const keys: AppDataKey[] = [];
  if (existing.mdiPatientId !== next.mdiPatientId) {
    keys.push(mdiPatientReverseKey(existing.mdiPatientId));
  }
  if (existing.mdiCaseId && existing.mdiCaseId !== next.mdiCaseId) {
    keys.push(mdiCaseReverseKey(existing.mdiCaseId));
  }

  return collectReverseDeletes(repository, keys, "mdiReverseLookup", next.cognitoSub);
}

function collectStaleStripeReverseDeletes(
  repository: AppDataRepository,
  existing: StripeLinkageRecord,
  next: StripeLinkageRecord,
): AppDataResult<TransactWriteOperation[]> {
  const keys: AppDataKey[] = [];
  if (existing.stripeCustomerId !== next.stripeCustomerId) {
    keys.push(stripeCustomerReverseKey(existing.stripeCustomerId));
  }
  if (existing.stripeSubscriptionId && existing.stripeSubscriptionId !== next.stripeSubscriptionId) {
    keys.push(stripeSubscriptionReverseKey(existing.stripeSubscriptionId));
  }

  return collectReverseDeletes(repository, keys, "stripeReverseLookup", next.cognitoSub);
}

function collectReverseDeletes(
  repository: AppDataRepository,
  keys: AppDataKey[],
  recordType: "mdiReverseLookup" | "stripeReverseLookup",
  cognitoSub: string,
): AppDataResult<TransactWriteOperation[]> {
  const deletes: TransactWriteOperation[] = [];

  for (const key of keys) {
    const existing = repository.get(key);
    if (!existing.ok) {
      return existing;
    }
    if (!existing.value) {
      continue;
    }
    if (existing.value.recordType !== recordType) {
      return err("validation_failed", "Reverse lookup record type mismatch");
    }
    if (existing.value.cognitoSub !== cognitoSub) {
      return err("conditional_conflict", "Vendor pointer already belongs to another patient");
    }

    deletes.push({ type: "delete", key, expected: existing.value });
  }

  return ok(deletes);
}

function keysMatch(record: AppDataRecord, key: AppDataKey) {
  return record.pk === key.pk && record.sk === key.sk;
}

function compoundKey(key: AppDataKey) {
  return `${key.pk}\u0000${key.sk}`;
}

function cloneRecord<T extends AppDataRecord>(record: T): T {
  if (record.recordType === "evidenceEvent" && record.metadata) {
    return { ...record, metadata: { ...record.metadata } } as T;
  }
  return { ...record };
}

function recordsEqual(left: AppDataRecord, right: AppDataRecord) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function ok<T>(value: T): AppDataResult<T> {
  return { ok: true, value };
}

function err(kind: AppDataErrorKind, message: string): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalHash(value: unknown) {
  return value === undefined ||
    (typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value));
}

function isConsentVersion(value: string) {
  return /^[a-z][a-z0-9-]*-\d{4}-\d{2}-[a-z0-9-]+$/.test(value) &&
    !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value));
}

function optionalSource(value: unknown) {
  return value === undefined || (typeof value === "string" && evidenceSources.has(value));
}

function optionalMdiPatientId(value: unknown) {
  return value === undefined || (typeof value === "string" && isMdiPatientId(value));
}

function optionalMdiCaseId(value: unknown) {
  return value === undefined || (typeof value === "string" && isMdiCaseId(value));
}

function optionalMdiSubmissionId(value: unknown) {
  return value === undefined || (typeof value === "string" && isMdiSubmissionId(value));
}

function optionalStripeCustomerId(value: unknown) {
  return value === undefined || (typeof value === "string" && isStripeCustomerId(value));
}

function optionalStripeSubscriptionId(value: unknown) {
  return value === undefined ||
    (typeof value === "string" && isStripeSubscriptionId(value));
}

function optionalWebhookEventId(value: unknown) {
  return value === undefined || (typeof value === "string" && isWebhookEventId(value));
}

function optionalRequestId(value: unknown) {
  return value === undefined || (typeof value === "string" && isRequestId(value));
}

function optionalAdminActorId(value: unknown) {
  return value === undefined || (typeof value === "string" && isAdminActorId(value));
}

function isSafeIdentifier(value: string, pattern: RegExp) {
  return pattern.test(value) &&
    !unsafeOpaqueIdentifierPatterns.some((pattern) => pattern.test(value)) &&
    !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value));
}

function isCognitoSub(value: string) {
  return isSafeIdentifier(
    value,
    /^(?:cognito-sub-[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
}

function isMdiPatientId(value: string) {
  return isSafeIdentifier(value, /^mdi_patient_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isMdiCaseId(value: string) {
  return isSafeIdentifier(value, /^mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isMdiSubmissionId(value: string) {
  return isSafeIdentifier(value, /^mdi_submission_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isStripeCustomerId(value: string) {
  return isSafeIdentifier(value, /^cus_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isStripeSubscriptionId(value: string) {
  return isSafeIdentifier(value, /^sub_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isWebhookEventId(value: string) {
  return value.length <= maxWebhookEventIdLength &&
    isSafeIdentifier(value, /^(?:evt|mdi_evt)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isWebhookEventIdForProvider(provider: WebhookProvider, value: unknown) {
  if (typeof value !== "string" || value.length > maxWebhookEventIdLength) {
    return false;
  }
  const pattern = provider === "stripe"
    ? /^evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/
    : /^mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/;
  return isSafeIdentifier(value, pattern) &&
    !unsafeWebhookEventIdPatterns.some((pattern) => pattern.test(value));
}

function isRequestId(value: string) {
  return isSafeIdentifier(value, /^req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isAdminActorId(value: string) {
  return isSafeIdentifier(value, /^admin_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/);
}

function isEvidenceEventId(record: EvidenceEventRecord) {
  switch (record.eventType) {
    case "consent_granted":
    case "consent_reprompted":
      return /^consent:terms-\d{4}-\d{2}-\d{2}$/.test(record.eventId);
    case "mdi_handoff_submitted":
      return record.mdiCaseId !== undefined &&
        record.eventId === `mdi:handoff:${record.mdiCaseId}`;
    case "mdi_handoff_failed":
      return /^mdi:handoff:failed:(?:req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*|mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)$/.test(record.eventId) &&
        !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
    case "mdi_status_updated":
      return record.mdiCaseId !== undefined &&
        typeof record.metadata?.status === "string" &&
        record.eventId === `mdi:status:${record.mdiCaseId}:${record.metadata.status}`;
    case "mdi_billing_unlock_decision":
      if (
        typeof record.mdiCaseId !== "string" ||
        !isMdiCaseId(record.mdiCaseId) ||
        !isMdiBillingUnlockAction(record.metadata?.billing_action)
      ) {
        return false;
      }
      if (record.metadata.billing_action === "activate_billing") {
        return record.eventId === `mdi:billing_unlock:${record.mdiCaseId}:activate_billing`;
      }
      return new RegExp(
        `^mdi:billing_unlock:${record.mdiCaseId}:${record.metadata.billing_action}:mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$`,
      ).test(record.eventId) &&
        !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
    case "mdi_partner_charge_recorded":
      return typeof record.mdiCaseId === "string" &&
        isMdiCaseId(record.mdiCaseId) &&
        (
          record.metadata?.charge_code === "partner_additional_charge" ||
          record.metadata?.charge_code === "vouched_amount_charge"
        ) &&
        new RegExp(
          `^mdi:partner_charge:${record.mdiCaseId}:${record.metadata.charge_code}:mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$`,
        ).test(record.eventId) &&
        !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
    case "mdi_dashboard_cue_recorded": {
      const cueCode = record.metadata?.cue_code;
      const cuePointer = mdiDashboardCuePointerFromEventId(record.eventId);
      if (
        !isMdiDashboardCueCode(cueCode) ||
        !isMdiDashboardCuePointer(cueCode, cuePointer) ||
        !isWebhookEventIdForProvider("mdi", mdiDashboardCueWebhookEventIdFromEventId(record.eventId))
      ) {
        return false;
      }
      if (record.mdiCaseId !== undefined) {
        return new RegExp(
          `^mdi:dashboard_cue:case:${record.mdiCaseId}:${cueCode}:[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$`,
        ).test(record.eventId) &&
          !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
      }
      if (record.mdiPatientId !== undefined) {
        return new RegExp(
          `^mdi:dashboard_cue:patient:${record.mdiPatientId}:${cueCode}:[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$`,
        ).test(record.eventId) &&
          !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
      }
      return false;
    }
    case "mdi_workflow_url_requested": {
      const workflow = record.metadata?.workflow;
      const requestId = mdiWorkflowRequestIdFromEventId(record.eventId);
      if (
        typeof record.mdiPatientId !== "string" ||
        !isMdiPatientId(record.mdiPatientId) ||
        !isMdiWorkflowCode(workflow) ||
        typeof requestId !== "string" ||
        record.requestId !== requestId ||
        !isRequestId(requestId) ||
        (workflow !== "messaging" && record.mdiCaseId !== undefined)
      ) {
        return false;
      }
      return new RegExp(
        `^mdi:workflow_url:${record.mdiPatientId}:${workflow}:req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$`,
      ).test(record.eventId) &&
        !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
    }
    case "stripe_payment_method_collected":
      return record.stripeCustomerId !== undefined &&
        record.eventId === `stripe:payment-method:${record.stripeCustomerId}:collected`;
    case "stripe_billing_activated":
      return record.stripeSubscriptionId !== undefined &&
        record.eventId === `stripe:billing:${record.stripeSubscriptionId}:active`;
    case "stripe_billing_status_changed":
      return record.stripeSubscriptionId !== undefined &&
        typeof record.metadata?.status === "string" &&
        record.eventId === `stripe:billing:${record.stripeSubscriptionId}:${record.metadata.status}`;
    case "webhook_claimed":
    case "webhook_processed":
    case "webhook_failed":
    case "webhook_side_effect_applied":
      return isEvidenceEventIdValue(record.eventId);
    case "support_action_recorded":
      return /^support:case-review:\d{3,12}$/.test(record.eventId);
    case "admin_action_recorded":
      return /^admin:action:\d{3,12}$/.test(record.eventId);
    case "auth_sign_in":
    case "auth_sign_up":
    case "auth_mfa_changed":
    case "auth_password_reset":
      return /^auth:(?:sign-in|sign-up|mfa-changed|password-reset):req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(record.eventId) &&
        !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(record.eventId));
    default:
      return false;
  }
}

function isEvidenceEventIdValue(value: string) {
  return evidenceEventIdPatterns.some((pattern) => pattern.test(value)) &&
    !unsafeOpaqueIdentifierPatterns.some((pattern) => pattern.test(value)) &&
    !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value));
}

function isIsoTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isSummaryCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(value);
}

function normalizeEvidenceEventLimit(value: number | undefined): AppDataResult<number> {
  if (value === undefined) {
    return ok(defaultEvidenceEventPageLimit);
  }
  if (!Number.isInteger(value) || value < 1) {
    return err("validation_failed", "Invalid evidence event page limit");
  }
  return ok(Math.min(value, maxEvidenceEventPageLimit));
}

function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return onboardingStatuses.has(value as OnboardingStatus);
}

function optionalUsStateCode(value: unknown): value is UsStateCode | undefined {
  return value === undefined || isUsStateCode(value);
}

function isBillingStatus(value: unknown): value is BillingStatus {
  return billingStatuses.has(value as BillingStatus);
}

function addSecondsIso(isoTimestamp: string, seconds: number) {
  return new Date(Date.parse(isoTimestamp) + seconds * 1000).toISOString();
}

function isWebhookStatus(value: unknown): value is WebhookProcessingStatus {
  return webhookStatuses.has(value as WebhookProcessingStatus);
}

function isMdiPatientCreateStatus(value: unknown): value is MdiPatientCreateStatus {
  return mdiPatientCreateStatuses.has(value as MdiPatientCreateStatus);
}

function isMdiCaseCreateStatus(value: unknown): value is MdiCaseCreateStatus {
  return mdiCaseCreateStatuses.has(value as MdiCaseCreateStatus);
}

function isMdiMirroredCaseStatus(value: unknown): value is MdiMirroredCaseStatus {
  return mdiMirroredCaseStatuses.has(value as MdiMirroredCaseStatus);
}

function isMdiBillingUnlockAction(value: unknown): value is string {
  return mdiBillingUnlockActions.has(value as string);
}

function isMdiDashboardCueCode(value: unknown): value is string {
  return mdiDashboardCueCodes.has(value as string);
}

function isMdiWorkflowCode(value: unknown): value is string {
  return mdiWorkflowCodes.has(value as string);
}

function mdiWorkflowRequestIdFromEventId(eventId: string) {
  const parts = eventId.split(":");
  return parts.length === 5 && parts[0] === "mdi" && parts[1] === "workflow_url"
    ? parts[4]
    : undefined;
}

function isMdiDashboardCuePointer(cueCode: string, value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(value) ||
    unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value)) ||
    unsafeOpaqueIdentifierPatterns.some((pattern) => pattern.test(value))
  ) {
    return false;
  }
  if (cueCode === "open_mdi_messages") {
    return value.startsWith("mdi_message_");
  }
  if (
    cueCode === "open_mdi_files" ||
    cueCode === "file_action_needed" ||
    cueCode === "files_unavailable"
  ) {
    return value.startsWith("mdi_file_") || value.startsWith("request_");
  }
  if (
    cueCode === "benefit_status_pending" ||
    cueCode === "cue_noop" ||
    cueCode === "ops_review_required"
  ) {
    return value.startsWith("mdi_voucher_");
  }
  if (cueCode === "exam_action_needed") {
    return value.startsWith("request_");
  }
  return false;
}

function mdiDashboardCuePointerFromEventId(eventId: string) {
  const parts = eventId.split(":");
  return parts.length === 7 && parts[0] === "mdi" && parts[1] === "dashboard_cue"
    ? parts[5]
    : undefined;
}

function mdiDashboardCueWebhookEventIdFromEventId(eventId: string) {
  const parts = eventId.split(":");
  return parts.length === 7 && parts[0] === "mdi" && parts[1] === "dashboard_cue"
    ? parts[6]
    : undefined;
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

function optionalIsoDate(value: unknown) {
  return value === undefined || isIsoTimestamp(value);
}

function optionalPositiveInteger(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function optionalHttpStatus(value: unknown) {
  return value === undefined ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 100 &&
      value <= 599);
}

function optionalRetryOwner(value: unknown) {
  return value === undefined ||
    value === "provider" ||
    value === "queue" ||
    value === "handoff";
}

function isEvidenceEventCategory(value: unknown): value is EvidenceEventCategory {
  return evidenceEventCategories.has(value as EvidenceEventCategory);
}

function isEvidenceEventType(value: unknown): value is EvidenceEventType {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(evidenceEventSchema, value);
}

function isEvidenceActorType(value: unknown): value is EvidenceActorType {
  return evidenceActorTypes.has(value as EvidenceActorType);
}

function isEvidenceEventStatus(value: unknown): value is EvidenceEventStatus {
  return evidenceEventStatuses.has(value as EvidenceEventStatus);
}

function validateEvidenceMetadata(eventType: EvidenceEventType, value: unknown) {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }

  const allowedMetadata = evidenceEventSchema[eventType].metadata as Record<
    string,
    readonly string[]
  >;
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    count += 1;
    if (count > 12) {
      return false;
    }

    const child = value[key];
    if (
      !Object.prototype.hasOwnProperty.call(allowedMetadata, key) ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(key) ||
      unsafeEvidenceMetadataKeys.some((pattern) => pattern.test(key)) ||
      typeof child !== "string" ||
      !isEvidenceMetadataValue(eventType, key, child)
    ) {
      return false;
    }
  }

  return true;
}

function isEvidenceMetadataValue(
  eventType: EvidenceEventType,
  key: string,
  value: string,
) {
  if (eventType === "mdi_partner_charge_recorded") {
    if (key === "amount_cents") {
      return /^[1-9][0-9]{0,7}$/.test(value);
    }
    if (key === "fingerprint") {
      return /^[a-f0-9]{64}$/.test(value);
    }
  }

  const allowedMetadata = evidenceEventSchema[eventType].metadata as Record<
    string,
    readonly string[]
  >;
  const allowedValues = allowedMetadata[key];
  return allowedValues !== undefined &&
    allowedValues.includes(value) &&
    /^[A-Za-z0-9._:-]{1,160}$/.test(value) &&
    !unsafeOpaqueIdentifierPatterns.some((pattern) => pattern.test(value)) &&
    !unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value));
}

const onboardingStatuses = new Set<OnboardingStatus>([
  "profile_pending",
  "intake_ready",
  "mdi_submitted",
  "clinical_review",
  "billing_ready",
]);

const billingStatuses = new Set<BillingStatus>([
  "not_started",
  "payment_method_pending",
  "payment_method_collected",
  "active",
  "past_due",
  "canceled",
]);

const webhookStatuses = new Set<WebhookProcessingStatus>([
  "processing",
  "processed",
  "failed",
]);

const mdiPatientCreateStatuses = new Set<MdiPatientCreateStatus>([
  "claiming",
  "provider_retryable_failure",
  "provider_terminal_failure",
  "storage_retryable_failure",
  "linked",
]);

const mdiCaseCreateStatuses = new Set<MdiCaseCreateStatus>([
  "claiming_case",
  "case_provider_retryable_failure",
  "case_provider_terminal_failure",
  "case_storage_retryable_failure",
  "submitted",
]);

const mdiMirroredCaseStatuses = new Set<MdiMirroredCaseStatus>([
  "assigned",
  "approved",
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

const mdiBillingUnlockActions = new Set([
  "activate_billing",
  "await_clinical_review",
  "await_payment_method",
  "cancel_active_billing",
  "cancel_pending_billing",
  "do_not_charge",
  "manual_review_required",
  "no_op",
  "provider_unavailable",
]);

const mdiDashboardCueCodes = new Set([
  "benefit_status_pending",
  "cue_noop",
  "exam_action_needed",
  "file_action_needed",
  "files_unavailable",
  "open_mdi_files",
  "open_mdi_messages",
  "ops_review_required",
]);

const mdiWorkflowCodes = new Set([
  "file_upload",
  "intro_video",
  "messaging",
]);

const defaultEvidenceEventPageLimit = 25;
const maxEvidenceEventPageLimit = 100;
const maxWebhookEventIdLength = 128;

const evidenceEventCategories = new Set<EvidenceEventCategory>([
  "consent",
  "mdi_handoff",
  "stripe_billing",
  "webhook",
  "support_admin",
  "auth",
]);

const evidenceActorTypes = new Set<EvidenceActorType>([
  "patient",
  "system",
  "admin",
  "vendor",
  "cognito",
]);

const evidenceEventStatuses = new Set<EvidenceEventStatus>([
  "recorded",
  "succeeded",
  "failed",
  "skipped",
]);

const evidenceSources = new Set([
  "app",
  "mdi",
  "stripe",
  "webhook",
  "support",
  "admin",
  "cognito",
]);

const evidenceEventIdPatterns = [
  /^consent:terms-\d{4}-\d{2}-\d{2}$/,
  /^mdi:handoff:mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  /^mdi:handoff:failed:(?:req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*|mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)$/,
  /^mdi:status:mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:(?:assigned|billing_ready|cancelled|clinical_review|completed|created|declined|processing|support|tagged|waiting)$/,
  /^mdi:billing_unlock:mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:activate_billing$/,
  /^mdi:billing_unlock:mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:(?:await_clinical_review|await_payment_method|cancel_active_billing|cancel_pending_billing|do_not_charge|manual_review_required|no_op|provider_unavailable):mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  /^mdi:partner_charge:mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:(?:partner_additional_charge|vouched_amount_charge):mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  /^mdi:dashboard_cue:(?:case:mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*|patient:mdi_patient_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*):(?:benefit_status_pending|cue_noop|exam_action_needed|file_action_needed|files_unavailable|open_mdi_files|open_mdi_messages|ops_review_required):[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:mdi_evt_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  /^mdi:workflow_url:mdi_patient_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:(?:file_upload|intro_video|messaging):req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  /^stripe:payment-method:cus_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:collected$/,
  /^stripe:billing:sub_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:(?:payment_method_pending|payment_method_collected|active|past_due|canceled)$/,
  /^webhook:(?:stripe|mdi):(?:evt|mdi_evt)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*:[A-Z][A-Z0-9_]{1,79}(?::[a-z][a-z0-9_]{0,39})?$/,
  /^support:case-review:\d{3,12}$/,
  /^admin:action:\d{3,12}$/,
  /^auth:(?:sign-in|sign-up|mfa-changed|password-reset):req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
];

const unsafeEvidenceMetadataKeys = [
  /answer/,
  /questionnaire/,
  /symptom/,
  /diagnosis/,
  /medication/,
  /clinical/,
  /payload/,
  /body/,
  /message/,
  /file/,
  /content/,
  /note/,
  /email/,
  /(^|_)name($|_)/,
  /(^|_)ip($|_)/,
  /ip_address/,
  /raw_ip/,
  /user_agent/,
  /useragent/,
];

const unsafeEvidenceValuePatterns = [
  /\b(symptom|diagnosis|medication|clinical|questionnaire|answer)\b/i,
  /\b(chest[_-]?pain|shortness[_-]?of[_-]?breath|pregnan|allerg|dosage|prescription|diabetes|lab[_-]?a1c|weight|hiv|opioid|substance|addiction|mental[_-]?health|depression|anxiety|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide)\b/i,
  /(?:^|[:._-])(hiv|opioid|substance|addiction|depression|anxiety|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide)(?:$|[:._-])/i,
  /\s/,
];

const unsafeOpaqueIdentifierPatterns = [
  /\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/,
  /(?:^|[^A-Za-z0-9])(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}(?:$|[^A-Za-z0-9])/i,
  /\[[0-9a-f:]+\](?::\d+)?/i,
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  /sk_(?:live|test)_/i,
  /rk_(?:live|test)_/i,
  /whsec_/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN/i,
  /bearer[:_-]/i,
];

const unsafeWebhookEventIdPatterns = [
  /@/,
  /(?:^|[_-])(email|first[_-]?name|last[_-]?name|phone|address|dob|birth|ssn)(?:$|[_-])/i,
  /(?:^|[_-])(questionnaire|question|answer|diagnosis|symptom|clinical|clinician|medication|condition|note)(?:$|[_-])/i,
  /(?:^|[_-])(asthma|cancer|diabetes|diabetic|hiv|hypertension|opioid|substance|addiction|depression|anxiety)(?:$|[_-])/i,
  /(?:^|[_-])(secret|token|authorization|bearer|api[_-]?key|payload|metadata)(?:$|[_-])/i,
];

const forbiddenClinicalFields = new Set([
  "answers",
  "questionnaire",
  "symptoms",
  "diagnosis",
  "medications",
  "clinicalNotes",
  "photos",
  "labs",
]);

function findForbiddenField(value: unknown, seen = new WeakSet<object>()): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenClinicalFields.has(key)) {
      return key;
    }
    const nested = findForbiddenField(child, seen);
    if (nested) {
      return nested;
    }
  }

  return null;
}

const baseFields = [
  "pk",
  "sk",
  "recordType",
  "schemaVersion",
  "createdAt",
  "updatedAt",
];

const allowedFields: Record<string, Set<string>> = {
  patientProfile: allow("cognitoSub", "onboardingStatus", "residencyState"),
  mdiLinkage: allow("cognitoSub", "mdiPatientId", "mdiCaseId"),
  mdiReverseLookup: allow("cognitoSub", "pointerType", "mdiPatientId", "mdiCaseId"),
  mdiPatientCreateAttempt: allow(
    "cognitoSub",
    "status",
    "attempts",
    "idempotencyKey",
    "claimExpiresAt",
    "lastAttemptAt",
    "linkedAt",
    "retryAfterSeconds",
    "providerStatus",
    "mdiPatientId",
  ),
  mdiCaseCreateAttempt: allow(
    "cognitoSub",
    "status",
    "attempts",
    "idempotencyKey",
    "claimExpiresAt",
    "lastAttemptAt",
    "linkedAt",
    "submittedAt",
    "providerStatus",
    "mdiPatientId",
    "mdiCaseId",
    "mdiSubmissionId",
  ),
  mdiCaseStatusMirror: allow(
    "cognitoSub",
    "mdiPatientId",
    "mdiCaseId",
    "caseStatus",
    "providerTimestamp",
    "webhookEventId",
    "statusRank",
    "terminal",
  ),
  mdiCaseStatusReconciliationIndex: allow(
    "cognitoSub",
    "mdiPatientId",
    "mdiCaseId",
    "caseStatus",
    "providerTimestamp",
    "webhookEventId",
    "statusRank",
    "terminal",
  ),
  stripeLinkage: allow(
    "cognitoSub",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "billingStatus",
    "stripeBillingStatusObservedAt",
    "stripeCurrentPeriodStart",
    "stripeCurrentPeriodEnd",
  ),
  stripeReverseLookup: allow(
    "cognitoSub",
    "pointerType",
    "stripeCustomerId",
    "stripeSubscriptionId",
  ),
  consentEvidence: allow(
    "cognitoSub",
    "consentKind",
    "version",
    "acceptedAt",
    "ipHash",
    "userAgentHash",
  ),
  webhookIdempotency: allow(
    "provider",
    "eventId",
    "status",
    "retryable",
    "attempts",
    "retryOwner",
    "processingExpiresAt",
    "nextAttemptAfter",
    "maxAttempts",
    "retryExhaustedAt",
  ),
  evidenceEvent: allow(
    "cognitoSub",
    "eventId",
    "eventType",
    "eventCategory",
    "occurredAt",
    "recordedAt",
    "actorType",
    "status",
    "summaryCode",
    "mdiPatientId",
    "mdiCaseId",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "webhookProvider",
    "webhookEventId",
    "requestId",
    "adminActorId",
    "source",
    "metadata",
  ),
  evidenceEventUniqueness: allow(
    "cognitoSub",
    "eventId",
    "evidencePk",
    "evidenceSk",
  ),
  evidenceCaseIndex: allow(
    "cognitoSub",
    "mdiCaseId",
    "eventId",
    "evidencePk",
    "evidenceSk",
  ),
  operationalStatus: allow(
    "name",
    "status",
    "stage",
    "jobName",
    "lastHeartbeatAt",
    "lastScheduledAt",
    "lastRequestId",
    "lastCursorPk",
    "lastCursorSk",
  ),
};

function allow(...fields: string[]) {
  return new Set([...baseFields, ...fields]);
}
