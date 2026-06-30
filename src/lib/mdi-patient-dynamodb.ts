import "server-only";

import {
  createMdiPatientCreateAttemptRecord,
  mdiLinkageKey,
  mdiPatientCreateAttemptKey,
  mdiPatientReverseKey,
  type AppDataErrorKind,
  type AppDataResult,
  type MdiLinkageRecord,
  type MdiPatientCreateAttemptRecord,
  type MdiPatientCreateStatus,
} from "@/lib/dynamodb/app-data";
import {
  getMdiLinkageDynamoDb,
  getPatientProfileDynamoDb,
  type DynamoDbAppDataRepository,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  createMdiPatientIdempotencyKey,
  mdiPatientFailure,
  type MdiPatientRepository,
  type MdiPatientResult,
} from "@/lib/mdi-patient";

export function createDynamoDbMdiPatientRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "put" | "transactWrite" | "update">,
): MdiPatientRepository {
  return {
    async getStatus(cognitoSub) {
      const profile = await getPatientProfileDynamoDb(repository, cognitoSub);
      if (!profile.ok) {
        return storageFailure(profile.error.message);
      }
      const linkage = await getMdiLinkageDynamoDb(repository, cognitoSub);
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }
      const attempt = await getMdiPatientCreateAttemptDynamoDb(repository, cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }

      return {
        ok: true,
        value: {
          attempt: attempt.value,
          linkage: linkage.value,
          onboardingStatus: profile.value?.onboardingStatus,
        },
      };
    },
    async claimCreate(input) {
      const existingLinkage = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
      if (!existingLinkage.ok) {
        return storageFailure(existingLinkage.error.message);
      }
      if (existingLinkage.value?.mdiPatientId) {
        return {
          ok: true,
          value: {
            outcome: "alreadyLinked",
            linkage: { mdiPatientId: existingLinkage.value.mdiPatientId },
          },
        };
      }

      const attempt = await getMdiPatientCreateAttemptDynamoDb(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const idempotencyKey = attempt.value?.idempotencyKey ??
        createMdiPatientIdempotencyKey(input.cognitoSub);

      if (!attempt.value) {
        const created = await repository.put(createMdiPatientCreateAttemptRecord({
          attempts: 1,
          claimExpiresAt: claimExpiresAt(input.now),
          cognitoSub: input.cognitoSub,
          idempotencyKey,
          lastAttemptAt: input.now,
          now: input.now,
          status: "claiming",
        }), { ifNotExists: true });
        if (created.ok) {
          return { ok: true, value: { outcome: "claimed", idempotencyKey } };
        }
        if (created.error.kind === "conditional_conflict") {
          return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
        }
        return storageFailure(created.error.message);
      }

      if (attempt.value.status === "linked" && attempt.value.mdiPatientId) {
        return {
          ok: true,
          value: {
            outcome: "alreadyLinked",
            linkage: { mdiPatientId: attempt.value.mdiPatientId },
          },
        };
      }
      if (attempt.value.status === "storage_retryable_failure" && attempt.value.mdiPatientId) {
        return {
          ok: true,
          value: {
            outcome: "linkExisting",
            idempotencyKey,
            mdiPatientId: attempt.value.mdiPatientId,
          },
        };
      }
      if (attempt.value.status === "claiming" && !isClaimExpired(attempt.value, input.now)) {
        return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
      }
      if (attempt.value.status === "provider_terminal_failure") {
        return { ok: true, value: { outcome: "terminalFailure", retryable: false } };
      }

      const next: MdiPatientCreateAttemptRecord = {
        ...attempt.value,
        attempts: attempt.value.attempts + 1,
        claimExpiresAt: claimExpiresAt(input.now),
        lastAttemptAt: input.now,
        providerStatus: undefined,
        retryAfterSeconds: undefined,
        status: "claiming",
        updatedAt: input.now,
      };
      const updated = await repository.update(next, { expected: attempt.value });
      if (updated.ok) {
        return { ok: true, value: { outcome: "claimed", idempotencyKey: updated.value.idempotencyKey } };
      }
      if (updated.error.kind === "conditional_conflict") {
        return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
      }
      return storageFailure(updated.error.message);
    },
    async recordFailure(input) {
      const attempt = await getMdiPatientCreateAttemptDynamoDb(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const previous = attempt.value ?? createMdiPatientCreateAttemptRecord({
        attempts: 0,
        cognitoSub: input.cognitoSub,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        status: "claiming",
      });
      const next: MdiPatientCreateAttemptRecord = {
        ...previous,
        claimExpiresAt: undefined,
        idempotencyKey: previous.idempotencyKey || input.idempotencyKey,
        lastAttemptAt: input.now,
        mdiPatientId: input.mdiPatientId ??
          (input.status === "storage_retryable_failure" ? previous.mdiPatientId : undefined),
        providerStatus: input.providerStatus,
        retryAfterSeconds: input.retryAfterSeconds,
        status: input.status,
        updatedAt: input.now,
      };
      const saved = attempt.value
        ? await repository.update(next, { expected: attempt.value })
        : await repository.put(next, { ifNotExists: true });
      return saved.ok ? { ok: true, value: saved.value } : storageFailure(saved.error.message);
    },
    async saveLinked(input) {
      const linkage = await createMdiPatientLinkageIfAbsentDynamoDb(repository, {
        cognitoSub: input.cognitoSub,
        mdiPatientId: input.mdiPatientId,
        now: input.now,
      });
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }

      const attempt = await getMdiPatientCreateAttemptDynamoDb(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const previous = attempt.value ?? createMdiPatientCreateAttemptRecord({
        attempts: 1,
        cognitoSub: input.cognitoSub,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        status: "claiming",
      });
      const next: MdiPatientCreateAttemptRecord = {
        ...previous,
        claimExpiresAt: undefined,
        idempotencyKey: previous.idempotencyKey || input.idempotencyKey,
        linkedAt: input.now,
        mdiPatientId: linkage.value.mdiPatientId,
        providerStatus: undefined,
        retryAfterSeconds: undefined,
        status: "linked",
        updatedAt: input.now,
      };
      const saved = attempt.value
        ? await repository.update(next, { expected: attempt.value })
        : await repository.put(next, { ifNotExists: true });
      if (!saved.ok) {
        return storageFailure(saved.error.message);
      }

      return {
        ok: true,
        value: {
          linkedAt: input.now,
          mdiPatientId: linkage.value.mdiPatientId,
        },
      };
    },
  };
}

async function getMdiPatientCreateAttemptDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  cognitoSub: string,
): Promise<AppDataResult<MdiPatientCreateAttemptRecord | null>> {
  const record = await repository.get(mdiPatientCreateAttemptKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<MdiPatientCreateAttemptRecord | null>;
  }
  if (record.value.recordType !== "mdiPatientCreateAttempt") {
    return appDataErr("validation_failed", "MDI patient create attempt key contains another record type");
  }
  return { ok: true, value: record.value };
}

async function createMdiPatientLinkageIfAbsentDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: {
    cognitoSub: string;
    mdiPatientId: string;
    now: string;
  },
): Promise<AppDataResult<MdiLinkageRecord>> {
  const existing = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
  if (!existing.ok) {
    return existing;
  }
  if (existing.value) {
    return { ok: true, value: existing.value };
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
  const reverse = {
    ...mdiPatientReverseKey(input.mdiPatientId),
    recordType: "mdiReverseLookup" as const,
    schemaVersion: 1 as const,
    cognitoSub: input.cognitoSub,
    pointerType: "patient" as const,
    mdiPatientId: input.mdiPatientId,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const transaction = await repository.transactWrite([
    { type: "put", record: linkage, ifNotExists: true },
    { type: "put", record: reverse, ifNotExists: true },
  ]);
  if (transaction.ok) {
    return { ok: true, value: linkage };
  }
  if (transaction.error.kind !== "conditional_conflict") {
    return transaction;
  }

  const reread = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
  return reread.ok && reread.value
    ? { ok: true, value: reread.value }
    : transaction;
}

function storageFailure(message: string): MdiPatientResult<never> {
  return mdiPatientFailure("storage_failed", message, { retryable: true, status: 500 });
}

function appDataErr(
  kind: Extract<AppDataErrorKind, "validation_failed">,
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}

function claimExpiresAt(now: string) {
  return new Date(Date.parse(now) + mdiPatientClaimLeaseMs).toISOString();
}

function isClaimExpired(attempt: MdiPatientCreateAttemptRecord, now: string) {
  const claimExpiresAtMs = attempt.claimExpiresAt
    ? Date.parse(attempt.claimExpiresAt)
    : Date.parse(attempt.lastAttemptAt ?? attempt.updatedAt) + mdiPatientClaimLeaseMs;
  return Number.isFinite(claimExpiresAtMs) && claimExpiresAtMs <= Date.parse(now);
}

const mdiPatientClaimLeaseMs = 15 * 60 * 1000;
