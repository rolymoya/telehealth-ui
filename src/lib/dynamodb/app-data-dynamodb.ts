import "server-only";

import { createHmac, createHash } from "node:crypto";
import {
  currentRequiredConsents,
  type RequiredConsentDocument,
} from "@/lib/consents";
import {
  type AppDataErrorKind,
  type AppDataKey,
  type AppDataRecord,
  type AppDataRepository,
  type AppDataResult,
  type BillingStatus,
  type ConsentEvidenceRecord,
  type EvidenceEventRecord,
  type MdiCaseStatusReconciliationIndexRecord,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type MdiMirroredCaseStatus,
  type MdiReverseLookupRecord,
  type OnboardingStatus,
  type PatientProfileRecord,
  type RecordCurrentMdiCaseStatusEvidenceInput,
  type StripeLinkageRecord,
  type StripeReverseLookupRecord,
  type TransactWriteOperation,
  type WebhookClaimOutcome,
  type WebhookIdempotencyRecord,
  type WebhookProcessingStatus,
  consentEvidenceKey,
  createConsentEvidenceRecord,
  createEvidenceEventRecord,
  createEvidenceEventWriteOperations,
  createPatientProfileRecord,
  isIdempotentEvidenceReplay,
  mdiCaseReverseKey,
  mdiCaseStatusReconciliationIndexPk,
  mdiCaseStatusReconciliationIndexKey,
  mdiCaseStatusMirrorKey,
  mdiLinkageKey,
  mdiPatientReverseKey,
  patientProfileKey,
  stripeCustomerReverseKey,
  stripeLinkageKey,
  stripeSubscriptionReverseKey,
  validateAppDataRecord,
  webhookIdempotencyKey,
} from "@/lib/dynamodb/app-data";
import type { AppDataReadRepository } from "@/lib/onboarding-status";

type FetchLike = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  },
) => Promise<{
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
}>;

type DynamoDbTarget =
  | "DynamoDB_20120810.DeleteItem"
  | "DynamoDB_20120810.GetItem"
  | "DynamoDB_20120810.PutItem"
  | "DynamoDB_20120810.Query"
  | "DynamoDB_20120810.TransactWriteItems";

export type DynamoDbAppDataConfig = {
  accessKeyId: string;
  endpoint?: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
  tableName: string;
};

export type DynamoDbAppDataRepository = {
  get(key: AppDataKey): Promise<AppDataResult<AppDataRecord | null>>;
  queryByKeyPrefix(input: Parameters<AppDataRepository["queryByKeyPrefix"]>[0]):
    Promise<ReturnType<AppDataRepository["queryByKeyPrefix"]>>;
  put<T extends AppDataRecord>(
    record: T,
    options?: Parameters<AppDataRepository["put"]>[1],
  ): Promise<AppDataResult<T>>;
  update<T extends AppDataRecord>(
    record: T,
    options?: Parameters<AppDataRepository["update"]>[1],
  ): Promise<AppDataResult<T>>;
  delete(
    key: AppDataKey,
    options?: Parameters<AppDataRepository["delete"]>[1],
  ): Promise<AppDataResult<void>>;
  transactWrite(operations: TransactWriteOperation[]): Promise<AppDataResult<void>>;
};

export function resolveDynamoDbAppDataConfig(
  env: Record<string, string | undefined>,
): AppDataResult<DynamoDbAppDataConfig> {
  const stage = cleanEnv(env.APOTH_STAGE);
  const tableName = cleanEnv(env.APP_TABLE_NAME) ??
    cleanEnv(env.APOTH_APP_TABLE_NAME) ??
    (stage ? `apoth-${stage}-app` : undefined);
  const region = cleanEnv(env.AWS_REGION) ?? cleanEnv(env.AWS_DEFAULT_REGION);
  const accessKeyId = cleanEnv(env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(env.AWS_SECRET_ACCESS_KEY);

  if (!tableName) {
    return err("validation_failed", "DynamoDB app table name is unavailable");
  }
  if (!region) {
    return err("validation_failed", "AWS region is unavailable");
  }
  if (!accessKeyId || !secretAccessKey) {
    return err("validation_failed", "AWS credentials are unavailable");
  }

  return ok({
    accessKeyId,
    endpoint: cleanEnv(env.APOTH_DYNAMODB_ENDPOINT),
    region,
    secretAccessKey,
    sessionToken: cleanEnv(env.AWS_SESSION_TOKEN),
    tableName,
  });
}

export function createDynamoDbAppDataReadRepository(
  config: DynamoDbAppDataConfig,
  options: { fetch?: FetchLike; now?: () => Date } = {},
): AppDataReadRepository {
  return createDynamoDbAppDataRepository(config, options);
}

export function createDynamoDbAppDataRepository(
  config: DynamoDbAppDataConfig,
  options: { fetch?: FetchLike; now?: () => Date } = {},
): DynamoDbAppDataRepository {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async get(key) {
      const response = await sendDynamoDbRequest({
        body: {
          ConsistentRead: true,
          Key: marshallKey(key),
          TableName: config.tableName,
        },
        config,
        fetchImpl,
        now: now(),
        operation: "GetItem",
        target: "DynamoDB_20120810.GetItem",
      });
      if (!response.ok) {
        return response;
      }

      const item = isRecord(response.value) && isRecord(response.value.Item)
        ? response.value.Item
        : null;
      if (!item) {
        return ok(null);
      }

      const unmarshalled = unmarshallRecord(item);
      if (!unmarshalled.ok) {
        return unmarshalled;
      }

      return validateAppDataRecord(unmarshalled.value);
    },

    async queryByKeyPrefix(input) {
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

      const response = await sendDynamoDbRequest({
        body: withoutUndefined({
          ConsistentRead: true,
          ExclusiveStartKey: input.exclusiveStartKey
            ? marshallKey(input.exclusiveStartKey)
            : undefined,
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk": "sk",
          },
          ExpressionAttributeValues: {
            ":pk": { S: input.pk },
            ":skPrefix": { S: input.skPrefix },
          },
          KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
          Limit: input.limit,
          TableName: config.tableName,
        }),
        config,
        fetchImpl,
        now: now(),
        operation: "Query",
        target: "DynamoDB_20120810.Query",
      });
      if (!response.ok) {
        return response;
      }

      const items = isRecord(response.value) && Array.isArray(response.value.Items)
        ? response.value.Items
        : [];
      const records: AppDataRecord[] = [];
      for (const item of items) {
        if (!isRecord(item)) {
          return err("validation_failed", "Invalid DynamoDB query item");
        }
        const unmarshalled = unmarshallRecord(item);
        if (!unmarshalled.ok) {
          return unmarshalled;
        }
        const validated = validateAppDataRecord(unmarshalled.value);
        if (!validated.ok) {
          return validated;
        }
        records.push(validated.value);
      }

      const lastEvaluatedKey = isRecord(response.value) && isRecord(response.value.LastEvaluatedKey)
        ? unmarshallKey(response.value.LastEvaluatedKey)
        : undefined;
      if (lastEvaluatedKey && !lastEvaluatedKey.ok) {
        return lastEvaluatedKey;
      }

      return ok({
        items: records,
        nextKey: lastEvaluatedKey?.value,
      });
    },

    async put(record, putOptions) {
      const validation = validateAppDataRecord(record);
      if (!validation.ok) {
        return validation;
      }

      const response = await sendDynamoDbRequest({
        body: withoutUndefined({
          ConditionExpression: putOptions?.ifNotExists
            ? "attribute_not_exists(#pk) AND attribute_not_exists(#sk)"
            : undefined,
          ExpressionAttributeNames: putOptions?.ifNotExists
            ? { "#pk": "pk", "#sk": "sk" }
            : undefined,
          Item: marshallRecord(validation.value),
          TableName: config.tableName,
        }),
        config,
        fetchImpl,
        now: now(),
        operation: "PutItem",
        target: "DynamoDB_20120810.PutItem",
      });
      return response.ok ? ok(validation.value as typeof record) : response;
    },

    async update(record, updateOptions) {
      const validation = validateAppDataRecord(record);
      if (!validation.ok) {
        return validation;
      }

      const condition = conditionForExpected(updateOptions?.expected);
      const response = await sendDynamoDbRequest({
        body: withoutUndefined({
          ConditionExpression: condition.expression,
          ExpressionAttributeNames: condition.names,
          ExpressionAttributeValues: condition.values,
          Item: marshallRecord(validation.value),
          TableName: config.tableName,
        }),
        config,
        fetchImpl,
        now: now(),
        operation: "PutItem",
        target: "DynamoDB_20120810.PutItem",
      });
      return response.ok ? ok(validation.value as typeof record) : response;
    },

    async delete(key, deleteOptions) {
      const condition = conditionForExpected(deleteOptions?.expected);
      const response = await sendDynamoDbRequest({
        body: withoutUndefined({
          ConditionExpression: condition.expression,
          ExpressionAttributeNames: condition.names,
          ExpressionAttributeValues: condition.values,
          Key: marshallKey(key),
          TableName: config.tableName,
        }),
        config,
        fetchImpl,
        now: now(),
        operation: "DeleteItem",
        target: "DynamoDB_20120810.DeleteItem",
      });
      return response.ok ? ok(undefined) : response;
    },

    async transactWrite(operations) {
      const transactItems: unknown[] = [];
      for (const operation of operations) {
        if (operation.type === "delete") {
          const condition = conditionForExpected(operation.expected);
          transactItems.push({
            Delete: withoutUndefined({
              ConditionExpression: condition.expression,
              ExpressionAttributeNames: condition.names,
              ExpressionAttributeValues: condition.values,
              Key: marshallKey(operation.key),
              TableName: config.tableName,
            }),
          });
          continue;
        }

        const validation = validateAppDataRecord(operation.record);
        if (!validation.ok) {
          return validation;
        }

        if (operation.type === "put") {
          transactItems.push({
            Put: withoutUndefined({
              ConditionExpression: operation.ifNotExists
                ? "attribute_not_exists(#pk) AND attribute_not_exists(#sk)"
                : undefined,
              ExpressionAttributeNames: operation.ifNotExists
                ? { "#pk": "pk", "#sk": "sk" }
                : undefined,
              Item: marshallRecord(validation.value),
              TableName: config.tableName,
            }),
          });
          continue;
        }

        const condition = conditionForExpected(operation.expected);
        transactItems.push({
          Put: withoutUndefined({
            ConditionExpression: condition.expression,
            ExpressionAttributeNames: condition.names,
            ExpressionAttributeValues: condition.values,
            Item: marshallRecord(validation.value),
            TableName: config.tableName,
          }),
        });
      }

      const response = await sendDynamoDbRequest({
        body: { TransactItems: transactItems },
        config,
        fetchImpl,
        now: now(),
        operation: "TransactWriteItems",
        target: "DynamoDB_20120810.TransactWriteItems",
      });
      return response.ok ? ok(undefined) : response;
    },
  };
}

export async function getPatientProfileDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  cognitoSub: string,
): Promise<AppDataResult<PatientProfileRecord | null>> {
  const record = await repository.get(patientProfileKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<PatientProfileRecord | null>;
  }
  if (record.value.recordType !== "patientProfile") {
    return err("validation_failed", "Patient profile key contains another record type");
  }
  return ok(record.value);
}

export async function getMdiLinkageDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  cognitoSub: string,
): Promise<AppDataResult<MdiLinkageRecord | null>> {
  const record = await repository.get(mdiLinkageKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<MdiLinkageRecord | null>;
  }
  if (record.value.recordType !== "mdiLinkage") {
    return err("validation_failed", "MDI linkage key contains another record type");
  }
  return ok(record.value);
}

export async function getStripeLinkageDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  cognitoSub: string,
): Promise<AppDataResult<StripeLinkageRecord | null>> {
  const record = await repository.get(stripeLinkageKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<StripeLinkageRecord | null>;
  }
  if (record.value.recordType !== "stripeLinkage") {
    return err("validation_failed", "Stripe linkage key contains another record type");
  }
  return ok(record.value);
}

export async function listEvidenceEventsForMdiCaseDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "queryByKeyPrefix">,
  input: {
    mdiCaseId: string;
    cognitoSub: string;
    limit?: number;
  },
): Promise<AppDataResult<EvidenceEventRecord[]>> {
  if (!/^mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(input.mdiCaseId)) {
    return err("validation_failed", "Invalid evidence case lookup ID");
  }

  const events: EvidenceEventRecord[] = [];
  let exclusiveStartKey: AppDataKey | undefined;
  do {
    const pointers = await repository.queryByKeyPrefix({
      pk: mdiCaseReverseKey(input.mdiCaseId).pk,
      skPrefix: "EVIDENCE#",
      limit: input.limit ?? 100,
      exclusiveStartKey,
    });
    if (!pointers.ok) {
      return pointers;
    }

    for (const pointer of pointers.value.items) {
      if (pointer.recordType !== "evidenceCaseIndex") {
        return err("validation_failed", "Evidence case timeline contained another record type");
      }
      if (pointer.cognitoSub !== input.cognitoSub || pointer.mdiCaseId !== input.mdiCaseId) {
        return err("validation_failed", "Evidence case pointer did not match lookup");
      }

      const event = await repository.get({ pk: pointer.evidencePk, sk: pointer.evidenceSk });
      if (!event.ok) {
        return event;
      }
      if (!event.value || event.value.recordType !== "evidenceEvent") {
        return err("validation_failed", "Evidence case pointer target was invalid");
      }
      events.push(event.value);
    }
    exclusiveStartKey = pointers.value.nextKey;
  } while (exclusiveStartKey);

  return ok(events);
}

export async function getConsentEvidenceDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  input: Parameters<typeof consentEvidenceKey> extends [
    infer CognitoSub,
    infer ConsentKind,
    infer Version,
  ] ? { cognitoSub: CognitoSub; consentKind: ConsentKind; version: Version }
    : never,
): Promise<AppDataResult<ConsentEvidenceRecord | null>> {
  const record = await repository.get(consentEvidenceKey(
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

export async function findPatientByStripePointerDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  pointer:
    | { pointerType: "customer"; stripeCustomerId: string }
    | { pointerType: "subscription"; stripeSubscriptionId: string },
): Promise<AppDataResult<string | null>> {
  const key = pointer.pointerType === "customer"
    ? stripeCustomerReverseKey(pointer.stripeCustomerId)
    : stripeSubscriptionReverseKey(pointer.stripeSubscriptionId);
  const record = await repository.get(key);
  if (!record.ok) {
    return record;
  }
  if (!record.value) {
    return ok(null);
  }
  return record.value.recordType === "stripeReverseLookup"
    ? ok(record.value.cognitoSub)
    : err("validation_failed", "Stripe reverse key contains another record type");
}

export async function upsertPatientProfileDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "put" | "update">,
  input: {
    cognitoSub: string;
    onboardingStatus: OnboardingStatus;
    now: string;
  },
): Promise<AppDataResult<PatientProfileRecord>> {
  const existing = await getPatientProfileDynamoDb(repository, input.cognitoSub);
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value) {
    return repository.put(createPatientProfileRecord(input), { ifNotExists: true });
  }

  return repository.update({
    ...existing.value,
    updatedAt: input.now,
  }, { expected: existing.value });
}

export async function transitionOnboardingStatusDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "update">,
  input: {
    cognitoSub: string;
    expected: OnboardingStatus;
    next: OnboardingStatus;
    now: string;
  },
): Promise<AppDataResult<PatientProfileRecord>> {
  const existing = await getPatientProfileDynamoDb(repository, input.cognitoSub);
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value) {
    return err("not_found", "Patient profile was not found");
  }
  if (existing.value.onboardingStatus !== input.expected) {
    return err("stale_transition", "Onboarding status did not match expected state");
  }

  return repository.update({
    ...existing.value,
    onboardingStatus: input.next,
    updatedAt: input.now,
  }, { expected: existing.value });
}

export async function recordConsentEvidenceDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "put">,
  input: Parameters<typeof createConsentEvidenceRecord>[0],
): Promise<AppDataResult<ConsentEvidenceRecord>> {
  return repository.put(createConsentEvidenceRecord(input), { ifNotExists: true });
}

export async function recordCurrentConsentAcceptanceDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: {
    acceptedAt: string;
    cognitoSub: string;
    ipHash?: string;
    now: string;
    requiredConsents?: readonly RequiredConsentDocument[];
    userAgentHash?: string;
  },
): Promise<AppDataResult<ConsentEvidenceRecord[]>> {
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
    const existing = await repository.get(record);
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

  const result = await repository.transactWrite(writes);
  return result.ok ? ok(acceptedRecords) : result;
}

export async function recordEvidenceEventDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: Parameters<typeof createEvidenceEventRecord>[0],
): Promise<AppDataResult<EvidenceEventRecord>> {
  const record = createEvidenceEventRecord(input);
  const writes = createEvidenceEventWriteOperations(record);
  if (!writes.ok) {
    return writes as AppDataResult<EvidenceEventRecord>;
  }

  const written = await repository.transactWrite(writes.value.operations);
  if (written.ok) {
    return ok(record);
  }
  if (record.eventCategory !== "webhook" || written.error.kind !== "conditional_conflict") {
    return written;
  }

  const existingUniqueness = await repository.get(writes.value.uniquenessKey);
  if (!existingUniqueness.ok) {
    return existingUniqueness;
  }
  if (existingUniqueness.value?.recordType !== "evidenceEventUniqueness") {
    return written;
  }

  const existing = await repository.get({
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

export async function recordCurrentMdiCaseStatusEvidenceDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: RecordCurrentMdiCaseStatusEvidenceInput,
): Promise<AppDataResult<{ applied: boolean; record: EvidenceEventRecord }>> {
  const record = createEvidenceEventRecord(input);
  const writes = createEvidenceEventWriteOperations(record);
  if (!writes.ok) {
    return writes as AppDataResult<{ applied: boolean; record: EvidenceEventRecord }>;
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
    const existing = await repository.get(mirrorKey);
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

    const written = await repository.transactWrite([
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

export async function listMdiCaseStatusReconciliationItemsDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "queryByKeyPrefix">,
  input: {
    exclusiveStartKey?: AppDataKey;
    includeTerminal?: boolean;
    limit?: number;
  } = {},
): Promise<AppDataResult<{
  items: MdiCaseStatusReconciliationIndexRecord[];
  nextKey?: AppDataKey;
}>> {
  const limit = input.limit ?? 100;
  const queried = await repository.queryByKeyPrefix({
    pk: mdiCaseStatusReconciliationIndexPk,
    skPrefix: "CASE#",
    limit,
    exclusiveStartKey: input.exclusiveStartKey,
  });
  if (!queried.ok) {
    return queried as AppDataResult<{
      items: MdiCaseStatusReconciliationIndexRecord[];
      nextKey?: AppDataKey;
    }>;
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

export async function claimWebhookEventDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "put" | "update">,
  input: {
    provider: "stripe" | "mdi";
    eventId: string;
    now: string;
    deliverySource?: "provider" | "queue";
    expectedAttempts?: number;
    processingLeaseSeconds?: number;
    maxAttempts?: number;
  },
): Promise<AppDataResult<WebhookClaimOutcome>> {
  const key = webhookIdempotencyKey(input.provider, input.eventId);
  const processingExpiresAt = addSecondsIso(input.now, input.processingLeaseSeconds ?? 300);
  const existing = await repository.get(key);
  if (!existing.ok) {
    return existing;
  }

  if (existing.value) {
    if (existing.value.recordType !== "webhookIdempotency") {
      return err("validation_failed", "Webhook key contains another record type");
    }
    const record = existing.value;
    if (record.status === "processing") {
      if (record.processingExpiresAt && isAtOrBefore(record.processingExpiresAt, input.now)) {
        if (record.maxAttempts !== undefined && record.attempts >= record.maxAttempts) {
          const exhaustedRecord: WebhookIdempotencyRecord = {
            ...record,
            nextAttemptAfter: undefined,
            processingExpiresAt: undefined,
            retryExhaustedAt: record.retryExhaustedAt ?? input.now,
            retryOwner: undefined,
            retryable: false,
            status: "failed",
            updatedAt: input.now,
          };
          const exhausted = await repository.update(exhaustedRecord, { expected: record });
          return exhausted.ok
            ? ok({ outcome: "retryExhausted", record: exhausted.value })
            : exhausted.error.kind === "conditional_conflict"
              ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
              : exhausted;
        }
        const retryRecord = {
          ...record,
          attempts: record.attempts + 1,
          maxAttempts: record.maxAttempts ?? input.maxAttempts,
          nextAttemptAfter: undefined,
          processingExpiresAt,
          retryOwner: undefined,
          retryable: false,
          status: "processing" as const,
          updatedAt: input.now,
        };
        const claimed = await repository.update(retryRecord, { expected: record });
        return claimed.ok
          ? ok({ outcome: "processingLeaseExpired", record: claimed.value })
          : claimed.error.kind === "conditional_conflict"
            ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
            : claimed;
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
          nextAttemptAfter: undefined,
          processingExpiresAt: undefined,
          retryExhaustedAt: record.retryExhaustedAt ?? input.now,
          retryOwner: undefined,
          retryable: false,
          status: "failed",
          updatedAt: input.now,
        };
        const exhausted = await repository.update(exhaustedRecord, { expected: record });
        return exhausted.ok
          ? ok({ outcome: "retryExhausted", record: exhausted.value })
          : exhausted.error.kind === "conditional_conflict"
            ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
            : exhausted;
      }
      if (
        record.nextAttemptAfter &&
        input.deliverySource !== "queue" &&
        isAfter(record.nextAttemptAfter, input.now)
      ) {
        return ok({ outcome: "retryNotDue", record });
      }
      const retryRecord = {
        ...record,
        attempts: record.attempts + 1,
        maxAttempts: record.maxAttempts ?? input.maxAttempts,
        nextAttemptAfter: undefined,
        processingExpiresAt,
        retryOwner: undefined,
        retryable: false,
        status: "processing" as const,
        updatedAt: input.now,
      };
      const claimed = await repository.update(retryRecord, { expected: record });
      return claimed.ok
        ? ok({ outcome: "failedRetryable", record: claimed.value })
        : claimed.error.kind === "conditional_conflict"
          ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
          : claimed;
    }
    return ok({ outcome: "conflict", record });
  }

  const record = {
    ...key,
    attempts: 1,
    createdAt: input.now,
    eventId: input.eventId,
    maxAttempts: input.maxAttempts,
    processingExpiresAt,
    provider: input.provider,
    recordType: "webhookIdempotency" as const,
    retryable: false,
    schemaVersion: 1 as const,
    status: "processing" as const,
    updatedAt: input.now,
  };
  const claimed = await repository.put(record, { ifNotExists: true });
  return claimed.ok
    ? ok({ outcome: "claimed", record: claimed.value })
    : claimed.error.kind === "conditional_conflict"
      ? err("duplicate_webhook_claim", "Webhook event was claimed concurrently")
      : claimed;
}

export async function markWebhookEventStatusDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "update">,
  input: {
    provider: "stripe" | "mdi";
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
) {
  const existing = await repository.get(webhookIdempotencyKey(input.provider, input.eventId));
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

  return repository.update({
    ...existing.value,
    maxAttempts: input.maxAttempts ?? existing.value.maxAttempts,
    nextAttemptAfter: input.nextAttemptAfter,
    processingExpiresAt: input.status === "processing"
      ? existing.value.processingExpiresAt
      : undefined,
    retryOwner: input.retryable ? (input.retryOwner ?? "provider") : undefined,
    retryable: input.retryable,
    status: input.status,
    updatedAt: input.now,
  }, { expected: existing.value });
}

export async function linkMdiPatientCaseDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: {
    cognitoSub: string;
    mdiCaseId?: string;
    mdiPatientId: string;
    now: string;
  },
): Promise<AppDataResult<MdiLinkageRecord>> {
  const existing = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
  if (!existing.ok) {
    return existing;
  }

  const linkage: MdiLinkageRecord = {
    ...mdiLinkageKey(input.cognitoSub),
    cognitoSub: input.cognitoSub,
    createdAt: existing.value?.createdAt ?? input.now,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    recordType: "mdiLinkage",
    schemaVersion: 1,
    updatedAt: input.now,
  };
  const reverseRecords: MdiReverseLookupRecord[] = [
    {
      ...mdiPatientReverseKey(input.mdiPatientId),
      cognitoSub: input.cognitoSub,
      createdAt: input.now,
      mdiPatientId: input.mdiPatientId,
      pointerType: "patient",
      recordType: "mdiReverseLookup",
      schemaVersion: 1,
      updatedAt: input.now,
    },
  ];
  if (input.mdiCaseId) {
    reverseRecords.push({
      ...mdiCaseReverseKey(input.mdiCaseId),
      cognitoSub: input.cognitoSub,
      createdAt: input.now,
      mdiCaseId: input.mdiCaseId,
      pointerType: "case",
      recordType: "mdiReverseLookup",
      schemaVersion: 1,
      updatedAt: input.now,
    });
  }

  const reverseCheck = await collectNewReverseRecords(repository, reverseRecords, input.cognitoSub);
  if (!reverseCheck.ok) {
    return reverseCheck;
  }
  const staleDeletes = await collectStaleMdiDeletes(repository, existing.value, linkage);
  if (!staleDeletes.ok) {
    return staleDeletes;
  }

  const transaction = await repository.transactWrite([
    existing.value
      ? { type: "update", record: linkage, expected: existing.value }
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

export async function linkStripeCustomerDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: {
    billingStatus: BillingStatus;
    cognitoSub: string;
    now: string;
    stripeCustomerId: string;
    allowedCurrentBillingStatuses?: BillingStatus[];
    stripeCurrentPeriodEnd?: string;
    stripeCurrentPeriodStart?: string;
    stripeBillingStatusObservedAt?: string;
    stripeSubscriptionId?: string;
  },
): Promise<AppDataResult<StripeLinkageRecord>> {
  const existing = await getStripeLinkageDynamoDb(repository, input.cognitoSub);
  if (!existing.ok) {
    return existing;
  }
  if (
    existing.value &&
    input.allowedCurrentBillingStatuses &&
    !input.allowedCurrentBillingStatuses.includes(existing.value.billingStatus)
  ) {
    return err("stale_transition", "Stripe linkage billing status changed before update");
  }

  const linkage: StripeLinkageRecord = {
    ...stripeLinkageKey(input.cognitoSub),
    billingStatus: input.billingStatus,
    cognitoSub: input.cognitoSub,
    createdAt: existing.value?.createdAt ?? input.now,
    recordType: "stripeLinkage",
    schemaVersion: 1,
    stripeBillingStatusObservedAt: input.stripeBillingStatusObservedAt,
    stripeCustomerId: input.stripeCustomerId,
    stripeCurrentPeriodEnd: input.stripeCurrentPeriodEnd,
    stripeCurrentPeriodStart: input.stripeCurrentPeriodStart,
    stripeSubscriptionId: input.stripeSubscriptionId,
    updatedAt: input.now,
  };
  const reverseRecords: StripeReverseLookupRecord[] = [
    {
      ...stripeCustomerReverseKey(input.stripeCustomerId),
      cognitoSub: input.cognitoSub,
      createdAt: input.now,
      pointerType: "customer",
      recordType: "stripeReverseLookup",
      schemaVersion: 1,
      stripeCustomerId: input.stripeCustomerId,
      updatedAt: input.now,
    },
  ];
  if (input.stripeSubscriptionId) {
    reverseRecords.push({
      ...stripeSubscriptionReverseKey(input.stripeSubscriptionId),
      cognitoSub: input.cognitoSub,
      createdAt: input.now,
      pointerType: "subscription",
      recordType: "stripeReverseLookup",
      schemaVersion: 1,
      stripeSubscriptionId: input.stripeSubscriptionId,
      updatedAt: input.now,
    });
  }

  const reverseCheck = await collectNewReverseRecords(repository, reverseRecords, input.cognitoSub);
  if (!reverseCheck.ok) {
    return reverseCheck;
  }
  const staleDeletes = await collectStaleStripeDeletes(repository, existing.value, linkage);
  if (!staleDeletes.ok) {
    return staleDeletes;
  }

  const transaction = await repository.transactWrite([
    existing.value
      ? { type: "update", record: linkage, expected: existing.value }
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

async function collectNewReverseRecords<T extends MdiReverseLookupRecord | StripeReverseLookupRecord>(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  records: T[],
  cognitoSub: string,
): Promise<AppDataResult<T[]>> {
  const newRecords: T[] = [];
  for (const record of records) {
    const existing = await repository.get(record);
    if (!existing.ok) {
      return existing;
    }
    if (!existing.value) {
      newRecords.push(record);
      continue;
    }
    if (!("cognitoSub" in existing.value) || existing.value.cognitoSub !== cognitoSub) {
      return err("conditional_conflict", "Vendor pointer already belongs to another patient");
    }
  }
  return ok(newRecords);
}

async function collectStaleMdiDeletes(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  previous: MdiLinkageRecord | null,
  next: MdiLinkageRecord,
): Promise<AppDataResult<TransactWriteOperation[]>> {
  if (!previous) {
    return ok([]);
  }

  const keys = [
    previous.mdiPatientId !== next.mdiPatientId
      ? mdiPatientReverseKey(previous.mdiPatientId)
      : null,
    previous.mdiCaseId && previous.mdiCaseId !== next.mdiCaseId
      ? mdiCaseReverseKey(previous.mdiCaseId)
      : null,
  ].filter((key): key is AppDataKey => Boolean(key));
  return collectOwnedReverseDeletes(repository, keys, next.cognitoSub);
}

async function collectStaleStripeDeletes(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  previous: StripeLinkageRecord | null,
  next: StripeLinkageRecord,
): Promise<AppDataResult<TransactWriteOperation[]>> {
  if (!previous) {
    return ok([]);
  }

  const keys = [
    previous.stripeCustomerId !== next.stripeCustomerId
      ? stripeCustomerReverseKey(previous.stripeCustomerId)
      : null,
    previous.stripeSubscriptionId && previous.stripeSubscriptionId !== next.stripeSubscriptionId
      ? stripeSubscriptionReverseKey(previous.stripeSubscriptionId)
      : null,
  ].filter((key): key is AppDataKey => Boolean(key));
  return collectOwnedReverseDeletes(repository, keys, next.cognitoSub);
}

async function collectOwnedReverseDeletes(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  keys: AppDataKey[],
  cognitoSub: string,
): Promise<AppDataResult<TransactWriteOperation[]>> {
  const deletes: TransactWriteOperation[] = [];
  for (const key of keys) {
    const existing = await repository.get(key);
    if (!existing.ok) {
      return existing;
    }
    if (!existing.value) {
      continue;
    }
    if (!("cognitoSub" in existing.value) || existing.value.cognitoSub !== cognitoSub) {
      return err("conditional_conflict", "Stale reverse pointer belongs to another patient");
    }
    deletes.push({ type: "delete", key, expected: existing.value });
  }
  return ok(deletes);
}

async function sendDynamoDbRequest(input: {
  body: Record<string, unknown>;
  config: DynamoDbAppDataConfig;
  fetchImpl: FetchLike;
  now: Date;
  operation: string;
  target: DynamoDbTarget;
}): Promise<AppDataResult<unknown>> {
  const body = JSON.stringify(withoutUndefined(input.body));
  const request = signDynamoDbRequest({
    body,
    config: input.config,
    now: input.now,
    target: input.target,
  });

  try {
    const response = await input.fetchImpl(request.url, {
      body,
      headers: request.headers,
      method: "POST",
    });
    const parsed = await safeJson(response);
    if (!response.ok) {
      return err(
        errorKindForDynamoDbResponse(parsed),
        `DynamoDB ${input.operation} failed with ${response.status}`,
      );
    }

    return ok(parsed ?? {});
  } catch {
    return err("unexpected_client_failure", `DynamoDB ${input.operation} request failed`);
  }
}

function signDynamoDbRequest(input: {
  body: string;
  config: DynamoDbAppDataConfig;
  now: Date;
  target: DynamoDbTarget;
}) {
  const endpoint = new URL(input.config.endpoint ?? `https://dynamodb.${input.config.region}.amazonaws.com`);
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.0",
    host: endpoint.host,
    "x-amz-date": amzDate,
    "x-amz-target": input.target,
  };
  if (input.config.sessionToken) {
    headers["x-amz-security-token"] = input.config.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${headers[name]}`)
    .join("\n");
  const canonicalRequest = [
    "POST",
    endpoint.pathname || "/",
    "",
    `${canonicalHeaders}\n`,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/dynamodb/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(
    input.config.secretAccessKey,
    dateStamp,
    input.config.region,
    "dynamodb",
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  return {
    headers: {
      ...headers,
      authorization: [
        `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders.join(";")}`,
        `Signature=${signature}`,
      ].join(", "),
    },
    url: endpoint.toString(),
  };
}

function conditionForExpected(expected: AppDataRecord | undefined) {
  if (!expected) {
    return {
      expression: "attribute_exists(#pk) AND attribute_exists(#sk)",
      names: { "#pk": "pk", "#sk": "sk" },
      values: undefined,
    };
  }

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const parts: string[] = [];
  let index = 0;
  for (const [key, value] of Object.entries(expected)) {
    if (value === undefined) {
      continue;
    }
    const nameKey = `#f${index}`;
    const valueKey = `:v${index}`;
    names[nameKey] = key;
    values[valueKey] = marshallAttribute(value);
    parts.push(`${nameKey} = ${valueKey}`);
    index += 1;
  }

  return {
    expression: parts.join(" AND "),
    names,
    values,
  };
}

function marshallKey(key: AppDataKey) {
  return {
    pk: { S: key.pk },
    sk: { S: key.sk },
  };
}

function unmarshallKey(key: Record<string, unknown>): AppDataResult<AppDataKey> {
  const pk = unmarshallAttribute(key.pk);
  const sk = unmarshallAttribute(key.sk);
  if (!pk.ok) {
    return pk;
  }
  if (!sk.ok) {
    return sk;
  }
  return typeof pk.value === "string" && typeof sk.value === "string"
    ? ok({ pk: pk.value, sk: sk.value })
    : err("validation_failed", "Invalid DynamoDB key");
}

function marshallRecord(record: AppDataRecord) {
  const item: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      item[key] = marshallAttribute(value);
    }
  }
  return item;
}

function marshallAttribute(value: unknown): unknown {
  if (typeof value === "string") {
    return { S: value };
  }
  if (typeof value === "number") {
    return { N: String(value) };
  }
  if (typeof value === "boolean") {
    return { BOOL: value };
  }
  if (value === null) {
    return { NULL: true };
  }
  if (Array.isArray(value)) {
    return { L: value.map(marshallAttribute) };
  }
  if (isRecord(value)) {
    const mapped: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        mapped[key] = marshallAttribute(item);
      }
    }
    return { M: mapped };
  }
  return { NULL: true };
}

function unmarshallRecord(item: Record<string, unknown>): AppDataResult<AppDataRecord> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    const unmarshalled = unmarshallAttribute(value);
    if (!unmarshalled.ok) {
      return unmarshalled;
    }
    record[key] = unmarshalled.value;
  }
  return ok(record as AppDataRecord);
}

function unmarshallAttribute(value: unknown): AppDataResult<unknown> {
  if (!isRecord(value)) {
    return err("validation_failed", "Invalid DynamoDB attribute value");
  }
  if (typeof value.S === "string") {
    return ok(value.S);
  }
  if (typeof value.N === "string") {
    const numberValue = Number(value.N);
    return Number.isFinite(numberValue)
      ? ok(numberValue)
      : err("validation_failed", "Invalid DynamoDB number value");
  }
  if (typeof value.BOOL === "boolean") {
    return ok(value.BOOL);
  }
  if (value.NULL === true) {
    return ok(null);
  }
  if (Array.isArray(value.L)) {
    const items: unknown[] = [];
    for (const item of value.L) {
      const unmarshalled = unmarshallAttribute(item);
      if (!unmarshalled.ok) {
        return unmarshalled;
      }
      items.push(unmarshalled.value);
    }
    return ok(items);
  }
  if (isRecord(value.M)) {
    const objectValue: Record<string, unknown> = {};
    for (const [mapKey, mapValue] of Object.entries(value.M)) {
      const unmarshalled = unmarshallAttribute(mapValue);
      if (!unmarshalled.ok) {
        return unmarshalled;
      }
      objectValue[mapKey] = unmarshalled.value;
    }
    return ok(objectValue);
  }
  return err("validation_failed", "Unsupported DynamoDB attribute value");
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      cleaned[key] = item;
    }
  }
  return cleaned as T;
}

async function safeJson(response: { json(): Promise<unknown> }) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorKindForDynamoDbResponse(parsed: unknown): AppDataErrorKind {
  const type = isRecord(parsed)
    ? typeof parsed.__type === "string"
      ? parsed.__type
      : typeof parsed.name === "string"
        ? parsed.name
        : ""
    : "";
  return type.includes("ConditionalCheckFailed")
    ? "conditional_conflict"
    : "unexpected_client_failure";
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, service);
  return hmac(dateRegionServiceKey, "aws4_request");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function addSecondsIso(value: string, seconds: number) {
  return new Date(new Date(value).getTime() + seconds * 1000).toISOString();
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

function isAtOrBefore(left: string, right: string) {
  return new Date(left).getTime() <= new Date(right).getTime();
}

function isAfter(left: string, right: string) {
  return new Date(left).getTime() > new Date(right).getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ok<T>(value: T): AppDataResult<T> {
  return { ok: true, value };
}

function err(kind: AppDataErrorKind, message: string): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
