import type { WebhookProvider } from "@/lib/webhooks";

export type AppDataKey = {
  pk: string;
  sk: string;
};

export type AppDataErrorKind =
  | "validation_failed"
  | "conditional_conflict"
  | "stale_transition"
  | "duplicate_webhook_claim"
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

export type StripeLinkageRecord = BaseRecord & {
  recordType: "stripeLinkage";
  cognitoSub: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  billingStatus: BillingStatus;
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
};

export type OperationalStatusRecord = BaseRecord & {
  recordType: "operationalStatus";
  name: string;
  status: string;
};

export type AppDataRecord =
  | PatientProfileRecord
  | MdiLinkageRecord
  | MdiReverseLookupRecord
  | StripeLinkageRecord
  | StripeReverseLookupRecord
  | ConsentEvidenceRecord
  | WebhookIdempotencyRecord
  | OperationalStatusRecord;

export type AppDataRepository = {
  get(key: AppDataKey): AppDataResult<AppDataRecord | null>;
  put<T extends AppDataRecord>(record: T, options?: { ifNotExists?: boolean }): AppDataResult<T>;
  update<T extends AppDataRecord>(record: T, options?: { expected?: AppDataRecord }): AppDataResult<T>;
  delete(key: AppDataKey, options?: { expected?: AppDataRecord }): AppDataResult<void>;
  transactWrite(operations: TransactWriteOperation[]): AppDataResult<void>;
};

export type TransactWriteOperation =
  | { type: "put"; record: AppDataRecord; ifNotExists?: boolean }
  | { type: "update"; record: AppDataRecord; expected?: AppDataRecord }
  | { type: "delete"; key: AppDataKey; expected?: AppDataRecord };

export type WebhookClaimOutcome =
  | { outcome: "claimed"; record: WebhookIdempotencyRecord }
  | { outcome: "alreadyProcessing"; record: WebhookIdempotencyRecord }
  | { outcome: "alreadyProcessed"; record: WebhookIdempotencyRecord }
  | { outcome: "failedRetryable"; record: WebhookIdempotencyRecord }
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
      const next = new Map(records);

      for (const operation of operations) {
        if (operation.type === "delete") {
          const key = compoundKey(operation.key);
          const existing = next.get(key);
          if (!existing) {
            return err("not_found", `Record not found for ${key}`);
          }
          if (operation.expected && !recordsEqual(existing, operation.expected)) {
            return err("conditional_conflict", `Expected record did not match ${key}`);
          }
          next.delete(key);
          continue;
        }

        const validation = validateAppDataRecord(operation.record);
        if (!validation.ok) {
          return validation;
        }

        const key = compoundKey(operation.record);
        if (operation.type === "put") {
          if (operation.ifNotExists && next.has(key)) {
            return err("conditional_conflict", `Record already exists for ${key}`);
          }
          next.set(key, cloneRecord(operation.record));
          continue;
        }

        const existing = next.get(key);
        if (!existing) {
          return err("not_found", `Record not found for ${key}`);
        }

        if (operation.expected && !recordsEqual(existing, operation.expected)) {
          return err("conditional_conflict", `Expected record did not match ${key}`);
        }
        next.set(key, cloneRecord(operation.record));
      }

      records.clear();
      for (const [key, value] of next.entries()) {
        records.set(key, value);
      }

      return ok(undefined);
    },
  };
}

export function createPatientProfileRecord(input: {
  cognitoSub: string;
  onboardingStatus: OnboardingStatus;
  now: string;
}): PatientProfileRecord {
  return {
    ...patientProfileKey(input.cognitoSub),
    recordType: "patientProfile",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    onboardingStatus: input.onboardingStatus,
    createdAt: input.now,
    updatedAt: input.now,
  };
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

export function linkStripeCustomer(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
    billingStatus: BillingStatus;
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

  const linkage: StripeLinkageRecord = {
    ...stripeLinkageKey(input.cognitoSub),
    recordType: "stripeLinkage",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    billingStatus: input.billingStatus,
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

export function recordConsentEvidence(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    version: string;
    acceptedAt: string;
    now: string;
    ipHash?: string;
    userAgentHash?: string;
  },
): AppDataResult<ConsentEvidenceRecord> {
  const record: ConsentEvidenceRecord = {
    ...consentEvidenceKey(input.cognitoSub, input.version),
    recordType: "consentEvidence",
    schemaVersion: 1,
    cognitoSub: input.cognitoSub,
    version: input.version,
    acceptedAt: input.acceptedAt,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash,
    createdAt: input.now,
    updatedAt: input.now,
  };

  return repository.put(record);
}

export function claimWebhookEvent(
  repository: AppDataRepository,
  input: {
    provider: WebhookProvider;
    eventId: string;
    now: string;
  },
): AppDataResult<WebhookClaimOutcome> {
  const key = webhookIdempotencyKey(input.provider, input.eventId);
  const existing = repository.get(key);
  if (!existing.ok) {
    return existing;
  }

  if (existing.value) {
    const record = existing.value as WebhookIdempotencyRecord;
    if (record.status === "processing") {
      return ok({ outcome: "alreadyProcessing", record });
    }
    if (record.status === "processed") {
      return ok({ outcome: "alreadyProcessed", record });
    }
    if (record.retryable) {
      const retryRecord: WebhookIdempotencyRecord = {
        ...record,
        status: "processing",
        retryable: false,
        attempts: record.attempts + 1,
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
  },
): AppDataResult<WebhookIdempotencyRecord> {
  const existing = repository.get(webhookIdempotencyKey(input.provider, input.eventId));
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value || existing.value.recordType !== "webhookIdempotency") {
    return err("not_found", "Webhook event has not been claimed");
  }

  const record: WebhookIdempotencyRecord = {
    ...existing.value,
    status: input.status,
    retryable: input.retryable,
    updatedAt: input.now,
  };

  return repository.update(record, { expected: existing.value });
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
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
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
        keysMatch(record, patientProfileKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid patient profile record");
    case "mdiLinkage":
      return typeof record.cognitoSub === "string" &&
        typeof record.mdiPatientId === "string" &&
        optionalString(record.mdiCaseId) &&
        keysMatch(record, mdiLinkageKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid MDI linkage record");
    case "mdiReverseLookup":
      return validateMdiReverse(record);
    case "stripeLinkage":
      return typeof record.cognitoSub === "string" &&
        typeof record.stripeCustomerId === "string" &&
        optionalString(record.stripeSubscriptionId) &&
        isBillingStatus(record.billingStatus) &&
        keysMatch(record, stripeLinkageKey(record.cognitoSub))
        ? ok(record)
        : err("validation_failed", "Invalid Stripe linkage record");
    case "stripeReverseLookup":
      return validateStripeReverse(record);
    case "consentEvidence":
      return typeof record.cognitoSub === "string" &&
        typeof record.version === "string" &&
        typeof record.acceptedAt === "string" &&
        optionalHash(record.ipHash) &&
        optionalHash(record.userAgentHash) &&
        keysMatch(record, consentEvidenceKey(record.cognitoSub, record.version))
        ? ok(record)
        : err("validation_failed", "Invalid consent evidence record");
    case "webhookIdempotency":
      return (record.provider === "stripe" || record.provider === "mdi") &&
        typeof record.eventId === "string" &&
        isWebhookStatus(record.status) &&
        typeof record.retryable === "boolean" &&
        Number.isInteger(record.attempts) &&
        record.attempts >= 0 &&
        keysMatch(record, webhookIdempotencyKey(record.provider, record.eventId))
        ? ok(record)
        : err("validation_failed", "Invalid webhook idempotency record");
    case "operationalStatus":
      return typeof record.name === "string" &&
        typeof record.status === "string" &&
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
  return value === undefined || (typeof value === "string" && value.startsWith("sha256:"));
}

function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return onboardingStatuses.has(value as OnboardingStatus);
}

function isBillingStatus(value: unknown): value is BillingStatus {
  return billingStatuses.has(value as BillingStatus);
}

function isWebhookStatus(value: unknown): value is WebhookProcessingStatus {
  return webhookStatuses.has(value as WebhookProcessingStatus);
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
  patientProfile: allow("cognitoSub", "onboardingStatus"),
  mdiLinkage: allow("cognitoSub", "mdiPatientId", "mdiCaseId"),
  mdiReverseLookup: allow("cognitoSub", "pointerType", "mdiPatientId", "mdiCaseId"),
  stripeLinkage: allow(
    "cognitoSub",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "billingStatus",
  ),
  stripeReverseLookup: allow(
    "cognitoSub",
    "pointerType",
    "stripeCustomerId",
    "stripeSubscriptionId",
  ),
  consentEvidence: allow(
    "cognitoSub",
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
  ),
  operationalStatus: allow("name", "status"),
};

function allow(...fields: string[]) {
  return new Set([...baseFields, ...fields]);
}
