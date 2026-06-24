import "server-only";

import {
  createMdiCaseCreateAttemptRecord,
  mdiCaseCreateAttemptKey,
  patientProfileKey,
  type AppDataResult,
  type MdiCaseCreateAttemptRecord,
  type MdiCaseCreateStatus,
  type MdiLinkageRecord,
} from "@/lib/dynamodb/app-data";
import {
  getMdiLinkageDynamoDb,
  getPatientProfileDynamoDb,
  linkMdiPatientCaseDynamoDb,
  transitionOnboardingStatusDynamoDb,
  type DynamoDbAppDataRepository,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  createMdiCaseIdempotencyKey,
  mdiIntakeFailure,
  type MdiIntakeLinkage,
  type MdiIntakeRepository,
  type MdiIntakeResult,
} from "@/lib/mdi-intake";

export function createDynamoDbMdiIntakeRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "put" | "transactWrite" | "update">,
): MdiIntakeRepository {
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
      const attempt = await getMdiCaseCreateAttemptDynamoDb(repository, cognitoSub);
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
    async claimSubmission(input) {
      const linkage = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }
      if (!linkage.value || linkage.value.mdiPatientId !== input.mdiPatientId) {
        return mdiIntakeFailure(
          "not_ready",
          "MDI patient linkage is not ready for case creation",
          { retryable: false, status: 409 },
        );
      }
      if (linkage.value.mdiCaseId) {
        return {
          ok: true,
          value: {
            idempotencyKey: createMdiCaseIdempotencyKey(input.cognitoSub),
            mdiCaseId: linkage.value.mdiCaseId,
            outcome: "linkExisting",
          },
        };
      }

      const attempt = await getMdiCaseCreateAttemptDynamoDb(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const idempotencyKey = attempt.value?.idempotencyKey ??
        createMdiCaseIdempotencyKey(input.cognitoSub);

      if (!attempt.value) {
        const created = await repository.put(createMdiCaseCreateAttemptRecord({
          attempts: 1,
          claimExpiresAt: claimExpiresAt(input.now),
          cognitoSub: input.cognitoSub,
          idempotencyKey,
          lastAttemptAt: input.now,
          mdiPatientId: input.mdiPatientId,
          now: input.now,
          status: "claiming_case",
        }), { ifNotExists: true });
        if (created.ok) {
          return { ok: true, value: { outcome: "claimed", idempotencyKey } };
        }
        if (created.error.kind === "conditional_conflict") {
          return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
        }
        return storageFailure(created.error.message);
      }

      if (
        (attempt.value.status === "case_storage_retryable_failure" ||
          attempt.value.status === "submitted") &&
        attempt.value.mdiCaseId
      ) {
        if (attempt.value.mdiPatientId !== input.mdiPatientId) {
          return storageFailure("MDI case attempt patient did not match linkage");
        }
        return {
          ok: true,
          value: {
            idempotencyKey,
            mdiCaseId: attempt.value.mdiCaseId,
            outcome: "linkExisting",
          },
        };
      }
      if (attempt.value.status === "claiming_case" && !isClaimExpired(attempt.value, input.now)) {
        return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
      }
      if (attempt.value.status === "case_provider_terminal_failure") {
        return { ok: true, value: { outcome: "terminalFailure", retryable: false } };
      }

      const next: MdiCaseCreateAttemptRecord = {
        ...attempt.value,
        attempts: attempt.value.attempts + 1,
        claimExpiresAt: claimExpiresAt(input.now),
        lastAttemptAt: input.now,
        mdiPatientId: input.mdiPatientId,
        providerStatus: undefined,
        status: "claiming_case",
        updatedAt: input.now,
      };
      const updated = await repository.update(next, { expected: attempt.value });
      if (updated.ok) {
        return {
          ok: true,
          value: { outcome: "claimed", idempotencyKey: updated.value.idempotencyKey },
        };
      }
      if (updated.error.kind === "conditional_conflict") {
        return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
      }
      return storageFailure(updated.error.message);
    },
    async recordFailure(input) {
      const attempt = await getMdiCaseCreateAttemptDynamoDb(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const previous = attempt.value ?? createMdiCaseCreateAttemptRecord({
        attempts: 0,
        cognitoSub: input.cognitoSub,
        idempotencyKey: input.idempotencyKey,
        mdiPatientId: input.mdiPatientId,
        now: input.now,
        status: "claiming_case",
      });
      const next: MdiCaseCreateAttemptRecord = {
        ...previous,
        claimExpiresAt: undefined,
        idempotencyKey: previous.idempotencyKey || input.idempotencyKey,
        lastAttemptAt: input.now,
        mdiCaseId: input.mdiCaseId ??
          (input.status === "case_storage_retryable_failure" ? previous.mdiCaseId : undefined),
        mdiPatientId: input.mdiPatientId,
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
    async saveSubmitted(input) {
      const linkage = await linkMdiCaseIfAbsentDynamoDb(repository, {
        cognitoSub: input.cognitoSub,
        mdiCaseId: input.linkage.mdiCaseId,
        mdiPatientId: input.linkage.mdiPatientId,
        now: input.now,
      });
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }

      const attempt = await getMdiCaseCreateAttemptDynamoDb(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const previous = attempt.value ?? createMdiCaseCreateAttemptRecord({
        attempts: 1,
        cognitoSub: input.cognitoSub,
        idempotencyKey: input.idempotencyKey,
        mdiPatientId: input.linkage.mdiPatientId,
        now: input.now,
        status: "claiming_case",
      });
      const next: MdiCaseCreateAttemptRecord = {
        ...previous,
        claimExpiresAt: undefined,
        idempotencyKey: previous.idempotencyKey || input.idempotencyKey,
        linkedAt: input.now,
        mdiCaseId: linkage.value.mdiCaseId,
        mdiPatientId: linkage.value.mdiPatientId,
        mdiSubmissionId: input.submissionId,
        submittedAt: input.now,
        providerStatus: undefined,
        status: "submitted",
        updatedAt: input.now,
      };
      const saved = attempt.value
        ? await repository.update(next, { expected: attempt.value })
        : await repository.put(next, { ifNotExists: true });
      if (!saved.ok) {
        return storageFailure(saved.error.message);
      }

      const transitioned = await transitionOnboardingStatusDynamoDb(repository, {
        cognitoSub: input.cognitoSub,
        expected: "intake_ready",
        next: "mdi_submitted",
        now: input.now,
      });
      if (!transitioned.ok && transitioned.error.kind !== "stale_transition") {
        return storageFailure(transitioned.error.message);
      }
      if (!transitioned.ok) {
        const profile = await repository.get(patientProfileKey(input.cognitoSub));
        if (!profile.ok) {
          return storageFailure(profile.error.message);
        }
        if (
          profile.value?.recordType !== "patientProfile" ||
          !isSubmittedStatus(profile.value.onboardingStatus)
        ) {
          return storageFailure(transitioned.error.message);
        }
      }

      return {
        ok: true,
        value: {
          mdiCaseId: linkage.value.mdiCaseId,
          mdiPatientId: linkage.value.mdiPatientId,
        },
      };
    },
  };
}

async function getMdiCaseCreateAttemptDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  cognitoSub: string,
): Promise<AppDataResult<MdiCaseCreateAttemptRecord | null>> {
  const record = await repository.get(mdiCaseCreateAttemptKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<MdiCaseCreateAttemptRecord | null>;
  }
  if (record.value.recordType !== "mdiCaseCreateAttempt") {
    return appDataErr("validation_failed", "MDI case create attempt key contains another record type");
  }
  return { ok: true, value: record.value };
}

async function linkMdiCaseIfAbsentDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: {
    cognitoSub: string;
    mdiPatientId: string;
    mdiCaseId: string;
    now: string;
  },
): Promise<AppDataResult<MdiLinkageRecord>> {
  const existing = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value) {
    return appDataErr("not_found", "MDI patient linkage was not found");
  }
  if (existing.value.mdiPatientId !== input.mdiPatientId) {
    return appDataErr("stale_transition", "MDI patient linkage did not match case creation input");
  }
  if (existing.value.mdiCaseId) {
    return { ok: true, value: existing.value };
  }

  const linked = await linkMdiPatientCaseDynamoDb(repository, input);
  if (linked.ok || linked.error.kind !== "conditional_conflict") {
    return linked;
  }

  const reread = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
  if (reread.ok && reread.value?.mdiCaseId) {
    return { ok: true, value: reread.value };
  }
  return linked;
}

function isSubmittedStatus(status: string | undefined) {
  return status === "mdi_submitted" ||
    status === "clinical_review" ||
    status === "billing_ready";
}

function storageFailure(message: string): MdiIntakeResult<never> {
  return mdiIntakeFailure("storage_failed", message, { retryable: true, status: 500 });
}

function claimExpiresAt(now: string) {
  return new Date(Date.parse(now) + mdiCaseClaimLeaseMs).toISOString();
}

function isClaimExpired(attempt: MdiCaseCreateAttemptRecord, now: string) {
  const claimExpiresAtMs = attempt.claimExpiresAt
    ? Date.parse(attempt.claimExpiresAt)
    : Date.parse(attempt.lastAttemptAt ?? attempt.updatedAt) + mdiCaseClaimLeaseMs;
  return Number.isFinite(claimExpiresAtMs) && claimExpiresAtMs <= Date.parse(now);
}

function appDataErr(
  kind: "not_found" | "stale_transition" | "validation_failed",
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}

const mdiCaseClaimLeaseMs = 15 * 60 * 1000;
