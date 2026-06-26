import "server-only";

import { createHash } from "node:crypto";
import {
  createMdiPatientCreateAttemptRecord,
  createMdiPatientLinkageIfAbsent,
  getMdiLinkage,
  getMdiPatientCreateAttempt,
  getPatientProfile,
  mdiPatientCreateAttemptKey,
  type AppDataRepository,
  type MdiLinkageRecord,
  type MdiPatientCreateAttemptRecord,
  type MdiPatientCreateStatus,
  type OnboardingStatus,
} from "@/lib/dynamodb/app-data";
import type { MdiClientError } from "@/lib/mdi/client";

export type MdiPatientPayload = Record<string, unknown>;

export type MdiPatientGateway = {
  createPatient(input: {
    idempotencyKey: string;
    patient: MdiPatientPayload;
  }): Promise<MdiPatientResult<{ mdiPatientId: string }>>;
};

export type MdiPatientRepositoryStatus = {
  attempt?: MdiPatientCreateAttemptRecord | null;
  linkage?: MdiLinkageRecord | null;
  onboardingStatus?: OnboardingStatus;
};

export type MdiPatientClaim =
  | { outcome: "claimed"; idempotencyKey: string }
  | { outcome: "alreadyLinked"; linkage: { mdiPatientId: string } }
  | { outcome: "alreadyClaiming"; retryable: true }
  | { outcome: "linkExisting"; idempotencyKey: string; mdiPatientId: string }
  | { outcome: "terminalFailure"; retryable: false };

export type MdiPatientRepository = {
  getStatus(cognitoSub: string): Promise<MdiPatientResult<MdiPatientRepositoryStatus>>;
  claimCreate(input: {
    cognitoSub: string;
    now: string;
  }): Promise<MdiPatientResult<MdiPatientClaim>>;
  recordFailure(input: {
    cognitoSub: string;
    idempotencyKey: string;
    now: string;
    providerStatus?: number;
    mdiPatientId?: string;
    retryAfterSeconds?: number;
    status: Extract<
      MdiPatientCreateStatus,
      "provider_retryable_failure" | "provider_terminal_failure" | "storage_retryable_failure"
    >;
  }): Promise<MdiPatientResult<MdiPatientCreateAttemptRecord>>;
  saveLinked(input: {
    cognitoSub: string;
    idempotencyKey: string;
    mdiPatientId: string;
    now: string;
  }): Promise<MdiPatientResult<{ mdiPatientId: string; linkedAt: string }>>;
};

export type MdiPatientErrorCode =
  | "create_in_progress"
  | "invalid_input"
  | "not_ready"
  | "provider_unavailable"
  | "storage_failed";

export type MdiPatientError = {
  code: MdiPatientErrorCode;
  message: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  status: number;
};

export type MdiPatientResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MdiPatientError };

export type MdiPatientLinkageResult = {
  mdiPatientId: string;
  status: "linked";
  linkedAt?: string;
};

export async function createMdiPatientLinkage(
  input: {
    cognitoSub: string;
    patient: MdiPatientPayload;
  },
  deps: {
    gateway: MdiPatientGateway;
    now?: () => Date;
    repository: MdiPatientRepository;
  },
): Promise<MdiPatientResult<MdiPatientLinkageResult>> {
  if (!input.cognitoSub || !isRecord(input.patient)) {
    return fail("invalid_input", "MDI patient create input was invalid", {
      retryable: false,
      status: 400,
    });
  }

  const status = await deps.repository.getStatus(input.cognitoSub);
  if (!status.ok) {
    return status;
  }
  if (status.value.linkage?.mdiPatientId) {
    return {
      ok: true,
      value: {
        mdiPatientId: status.value.linkage.mdiPatientId,
        status: "linked",
        linkedAt: status.value.linkage.updatedAt,
      },
    };
  }
  if (status.value.onboardingStatus !== "intake_ready") {
    return fail("not_ready", "Patient is not ready for MDI patient creation", {
      retryable: false,
      status: 409,
    });
  }

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const claim = await deps.repository.claimCreate({
    cognitoSub: input.cognitoSub,
    now,
  });
  if (!claim.ok) {
    return claim;
  }
  if (claim.value.outcome === "alreadyLinked") {
    return {
      ok: true,
      value: {
        mdiPatientId: claim.value.linkage.mdiPatientId,
        status: "linked",
      },
    };
  }
  if (claim.value.outcome === "alreadyClaiming") {
    return fail("create_in_progress", "MDI patient creation is already in progress", {
      retryable: true,
      status: 409,
    });
  }
  if (claim.value.outcome === "linkExisting") {
    return saveClaimedMdiPatientLinkage(input.cognitoSub, claim.value, now, deps.repository);
  }
  if (claim.value.outcome === "terminalFailure") {
    return fail("provider_unavailable", "MDI patient creation previously failed", {
      retryable: false,
      status: 502,
    });
  }

  const created = await deps.gateway.createPatient({
    idempotencyKey: claim.value.idempotencyKey,
    patient: input.patient,
  });
  if (!created.ok) {
    const recorded = await deps.repository.recordFailure({
      cognitoSub: input.cognitoSub,
      idempotencyKey: claim.value.idempotencyKey,
      now,
      providerStatus: created.error.status,
      retryAfterSeconds: created.error.retryAfterSeconds,
      status: created.error.retryable
        ? "provider_retryable_failure"
        : "provider_terminal_failure",
    });
    if (!recorded.ok) {
      return recorded;
    }
    return created;
  }

  const linked = await deps.repository.saveLinked({
    cognitoSub: input.cognitoSub,
    idempotencyKey: claim.value.idempotencyKey,
    mdiPatientId: created.value.mdiPatientId,
    now,
  });
  if (!linked.ok) {
    const recorded = await deps.repository.recordFailure({
      cognitoSub: input.cognitoSub,
      idempotencyKey: claim.value.idempotencyKey,
      mdiPatientId: created.value.mdiPatientId,
      now,
      status: "storage_retryable_failure",
    });
    if (!recorded.ok) {
      return recorded;
    }
    return linked;
  }

  return {
    ok: true,
    value: {
      linkedAt: linked.value.linkedAt,
      mdiPatientId: linked.value.mdiPatientId,
      status: "linked",
    },
  };
}

export function createAppDataMdiPatientRepository(
  repository: AppDataRepository,
): MdiPatientRepository {
  return {
    async getStatus(cognitoSub) {
      const profile = getPatientProfile(repository, cognitoSub);
      if (!profile.ok) {
        return storageFailure(profile.error.message);
      }
      const linkage = getMdiLinkage(repository, cognitoSub);
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }
      const attempt = getMdiPatientCreateAttempt(repository, cognitoSub);
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
      const existingLinkage = getMdiLinkage(repository, input.cognitoSub);
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

      const attempt = getMdiPatientCreateAttempt(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const idempotencyKey = attempt.value?.idempotencyKey ??
        createMdiPatientIdempotencyKey(input.cognitoSub);

      if (!attempt.value) {
        const created = repository.put(createMdiPatientCreateAttemptRecord({
          attempts: 1,
          cognitoSub: input.cognitoSub,
          idempotencyKey,
          claimExpiresAt: claimExpiresAt(input.now),
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
      const updated = repository.update(next, { expected: attempt.value });
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
      const attempt = getMdiPatientCreateAttempt(repository, input.cognitoSub);
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
        idempotencyKey: previous.idempotencyKey || input.idempotencyKey,
        claimExpiresAt: undefined,
        lastAttemptAt: input.now,
        mdiPatientId: input.mdiPatientId ??
          (input.status === "storage_retryable_failure" ? previous.mdiPatientId : undefined),
        providerStatus: input.providerStatus,
        retryAfterSeconds: input.retryAfterSeconds,
        status: input.status,
        updatedAt: input.now,
      };
      const saved = attempt.value
        ? repository.update(next, { expected: attempt.value })
        : repository.put(next, { ifNotExists: true });
      return saved.ok ? { ok: true, value: saved.value } : storageFailure(saved.error.message);
    },
    async saveLinked(input) {
      const linkage = createMdiPatientLinkageIfAbsent(repository, {
        cognitoSub: input.cognitoSub,
        mdiPatientId: input.mdiPatientId,
        now: input.now,
      });
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }

      const attempt = getMdiPatientCreateAttempt(repository, input.cognitoSub);
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
        idempotencyKey: previous.idempotencyKey || input.idempotencyKey,
        claimExpiresAt: undefined,
        linkedAt: input.now,
        mdiPatientId: linkage.value.mdiPatientId,
        providerStatus: undefined,
        retryAfterSeconds: undefined,
        status: "linked",
        updatedAt: input.now,
      };
      const saved = attempt.value
        ? repository.update(next, { expected: attempt.value })
        : repository.put(next, { ifNotExists: true });
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

export function createMdiPatientIdempotencyKey(cognitoSub: string) {
  return `mdi-patient-${createHash("sha256")
    .update(`mdi-patient:${cognitoSub}`)
    .digest("hex")
    .slice(0, 32)}`;
}

async function saveClaimedMdiPatientLinkage(
  cognitoSub: string,
  claim: { idempotencyKey: string; mdiPatientId: string },
  now: string,
  repository: MdiPatientRepository,
): Promise<MdiPatientResult<MdiPatientLinkageResult>> {
  const linked = await repository.saveLinked({
    cognitoSub,
    idempotencyKey: claim.idempotencyKey,
    mdiPatientId: claim.mdiPatientId,
    now,
  });
  if (!linked.ok) {
    const recorded = await repository.recordFailure({
      cognitoSub,
      idempotencyKey: claim.idempotencyKey,
      mdiPatientId: claim.mdiPatientId,
      now,
      status: "storage_retryable_failure",
    });
    if (!recorded.ok) {
      return recorded;
    }
    return linked;
  }

  return {
    ok: true,
    value: {
      linkedAt: linked.value.linkedAt,
      mdiPatientId: linked.value.mdiPatientId,
      status: "linked",
    },
  };
}

export function mapMdiPatientClientError(error: MdiClientError): MdiPatientError {
  return {
    code: "provider_unavailable",
    message: "MDI patient creation failed",
    retryAfterSeconds: error.retryAfterSeconds,
    retryable: error.retryable,
    status: error.status && error.status >= 400 && error.status <= 599 ? error.status : 502,
  };
}

export function mdiPatientFailure(
  code: MdiPatientErrorCode,
  message: string,
  options: { retryable: boolean; retryAfterSeconds?: number; status: number },
): MdiPatientResult<never> {
  return fail(code, message, options);
}

function storageFailure(message: string): MdiPatientResult<never> {
  return fail("storage_failed", message, { retryable: true, status: 500 });
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

function fail(
  code: MdiPatientErrorCode,
  message: string,
  options: { retryable: boolean; retryAfterSeconds?: number; status: number },
): MdiPatientResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(options.retryAfterSeconds ? { retryAfterSeconds: options.retryAfterSeconds } : {}),
      retryable: options.retryable,
      status: options.status,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const mdiPatientClaimLeaseMs = 15 * 60 * 1000;
