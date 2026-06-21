import { createHash } from "node:crypto";
import {
  createMdiCaseCreateAttemptRecord,
  getMdiCaseCreateAttempt,
  getMdiLinkage,
  getPatientProfile,
  linkMdiCaseIfAbsent,
  transitionOnboardingStatus,
  type AppDataRepository,
  type MdiCaseCreateAttemptRecord,
  type MdiCaseCreateStatus,
  type MdiLinkageRecord,
  type OnboardingStatus,
} from "@/lib/dynamodb/app-data";

export type MdiIntakeQuestionOption = {
  optionId: string;
  label: string;
};

export type MdiIntakeQuestion = {
  questionId: string;
  text: string;
  controlType: "single_select" | "free_text" | string;
  required: boolean;
  options?: MdiIntakeQuestionOption[];
  constraints?: Record<string, unknown>;
};

export type MdiIntakeQuestionnaire = {
  questionnaireId: string;
  patientId: string;
  caseId?: string;
  questions: MdiIntakeQuestion[];
};

export type MdiIntakeStatus =
  | "profile_pending"
  | "intake_ready"
  | "mdi_submitted"
  | "clinical_review"
  | "billing_ready";

export type MdiIntakeLinkage = {
  mdiPatientId: string;
  mdiCaseId?: string;
};

export type MdiIntakeRepositoryStatus = {
  attempt?: MdiCaseCreateAttemptRecord | null;
  onboardingStatus?: MdiIntakeStatus;
  linkage?: MdiIntakeLinkage | null;
};

export type MdiIntakeClaim =
  | { outcome: "claimed"; idempotencyKey: string }
  | { outcome: "alreadyClaiming"; retryable: true }
  | { outcome: "linkExisting"; idempotencyKey: string; mdiCaseId: string }
  | { outcome: "terminalFailure"; retryable: false };

export type MdiIntakeRepository = {
  getStatus(cognitoSub: string): Promise<MdiIntakeResult<MdiIntakeRepositoryStatus>>;
  claimSubmission(input: {
    cognitoSub: string;
    mdiPatientId: string;
    now: string;
  }): Promise<MdiIntakeResult<MdiIntakeClaim>>;
  recordFailure(input: {
    cognitoSub: string;
    idempotencyKey: string;
    mdiCaseId?: string;
    mdiPatientId: string;
    now: string;
    providerStatus?: number;
    status: Extract<
      MdiCaseCreateStatus,
      "case_provider_retryable_failure" | "case_provider_terminal_failure" | "case_storage_retryable_failure"
    >;
  }): Promise<MdiIntakeResult<MdiCaseCreateAttemptRecord>>;
  saveSubmitted(input: {
    cognitoSub: string;
    idempotencyKey: string;
    linkage: Required<MdiIntakeLinkage>;
    now: string;
    submissionId?: string;
  }): Promise<MdiIntakeResult<MdiIntakeLinkage>>;
};

export type MdiIntakeGateway = {
  createCase(input: {
    casePayload: MdiCasePayload;
    cognitoSub: string;
    idempotencyKey: string;
    patientId: string;
    questionnaireId: string;
    responses: MdiIntakeResponse[];
  }): Promise<MdiIntakeResult<{
    linkage: Required<MdiIntakeLinkage>;
    submissionId?: string;
  }>>;
  loadQuestionnaire(input: {
    cognitoSub: string;
    linkage?: MdiIntakeLinkage | null;
  }): Promise<MdiIntakeResult<MdiIntakeQuestionnaire>>;
};

export type MdiCasePayload = Record<string, unknown>;

export type MdiIntakeResponse = {
  questionId: string;
  value: unknown;
};

export type MdiIntakeErrorCode =
  | "invalid_input"
  | "not_ready"
  | "precheck_required"
  | "provider_unavailable"
  | "submission_in_progress"
  | "storage_failed";

export type MdiIntakeError = {
  code: MdiIntakeErrorCode;
  message: string;
  retryable: boolean;
  status: number;
};

export type MdiIntakeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MdiIntakeError };

export type MdiIntakeBootstrap =
  | {
      status: "ready";
      questionnaire: MdiIntakeQuestionnaire;
    }
  | {
      status: "submitted" | "clinical_review" | "billing_ready";
      linkage: MdiIntakeLinkage;
    };

export type MdiIntakeSubmission = {
  status: "submitted";
  linkage: MdiIntakeLinkage;
  submissionId?: string;
};

export async function loadMdiIntake(
  input: { cognitoSub: string },
  deps: {
    gateway: Pick<MdiIntakeGateway, "loadQuestionnaire">;
    repository: Pick<MdiIntakeRepository, "getStatus">;
  },
): Promise<MdiIntakeResult<MdiIntakeBootstrap>> {
  const status = await deps.repository.getStatus(input.cognitoSub);
  if (!status.ok) {
    return status;
  }

  if (isSubmittedStatus(status.value.onboardingStatus)) {
    if (!status.value.linkage?.mdiCaseId) {
      return storageFailure("MDI handoff status is missing linkage");
    }
    return {
      ok: true,
      value: {
        status: status.value.onboardingStatus === "mdi_submitted"
          ? "submitted"
          : status.value.onboardingStatus,
        linkage: status.value.linkage,
      },
    };
  }

  if (status.value.onboardingStatus !== "intake_ready") {
    return fail("precheck_required", "Intake precheck must be completed first", {
      retryable: false,
      status: 409,
    });
  }

  const questionnaire = await deps.gateway.loadQuestionnaire({
    cognitoSub: input.cognitoSub,
    linkage: status.value.linkage,
  });
  if (!questionnaire.ok) {
    return questionnaire;
  }

  return {
    ok: true,
    value: {
      status: "ready",
      questionnaire: questionnaire.value,
    },
  };
}

export async function submitMdiIntake(
  input: {
    casePayload: MdiCasePayload;
    cognitoSub: string;
    questionnaireId: string;
    responses: MdiIntakeResponse[];
  },
  deps: {
    expectedQuestionnaireId?: string;
    gateway: Pick<MdiIntakeGateway, "createCase">;
    now?: () => Date;
    repository: MdiIntakeRepository;
  },
): Promise<MdiIntakeResult<MdiIntakeSubmission>> {
  const valid = validateSubmissionInput(input);
  if (!valid.ok) {
    return valid;
  }
  if (
    deps.expectedQuestionnaireId &&
    input.questionnaireId !== deps.expectedQuestionnaireId
  ) {
    return fail("invalid_input", "MDI intake questionnaire did not match the current flow", {
      retryable: false,
      status: 400,
    });
  }

  const status = await deps.repository.getStatus(input.cognitoSub);
  if (!status.ok) {
    return status;
  }
  if (isSubmittedStatus(status.value.onboardingStatus) && status.value.linkage?.mdiCaseId) {
    return {
      ok: true,
      value: {
        status: "submitted",
        linkage: status.value.linkage,
      },
    };
  }
  if (status.value.onboardingStatus !== "intake_ready") {
    return fail("not_ready", "MDI intake is not ready for submission", {
      retryable: false,
      status: 409,
    });
  }
  if (!status.value.linkage?.mdiPatientId) {
    return fail("not_ready", "MDI patient linkage is required before case creation", {
      retryable: false,
      status: 409,
    });
  }

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const claimed = await deps.repository.claimSubmission({
    cognitoSub: input.cognitoSub,
    mdiPatientId: status.value.linkage.mdiPatientId,
    now,
  });
  if (!claimed.ok) {
    return claimed;
  }
  if (claimed.value.outcome === "alreadyClaiming") {
    return fail("submission_in_progress", "MDI intake submission is already in progress", {
      retryable: true,
      status: 409,
    });
  }
  if (claimed.value.outcome === "terminalFailure") {
    return fail("provider_unavailable", "MDI intake submission previously failed", {
      retryable: false,
      status: 502,
    });
  }
  if (claimed.value.outcome === "linkExisting") {
    return saveExistingCaseSubmission({
      cognitoSub: input.cognitoSub,
      idempotencyKey: claimed.value.idempotencyKey,
      mdiCaseId: claimed.value.mdiCaseId,
      mdiPatientId: status.value.linkage.mdiPatientId,
      now,
      repository: deps.repository,
    });
  }

  const created = await deps.gateway.createCase({
    casePayload: input.casePayload,
    cognitoSub: input.cognitoSub,
    idempotencyKey: claimed.value.idempotencyKey,
    patientId: status.value.linkage.mdiPatientId,
    questionnaireId: input.questionnaireId,
    responses: input.responses,
  });
  if (!created.ok) {
    const recorded = await deps.repository.recordFailure({
      cognitoSub: input.cognitoSub,
      idempotencyKey: claimed.value.idempotencyKey,
      mdiPatientId: status.value.linkage.mdiPatientId,
      now,
      providerStatus: created.error.status,
      status: created.error.retryable
        ? "case_provider_retryable_failure"
        : "case_provider_terminal_failure",
    });
    return recorded.ok ? created : recorded;
  }
  if (created.value.linkage.mdiPatientId !== status.value.linkage.mdiPatientId) {
    const recorded = await deps.repository.recordFailure({
      cognitoSub: input.cognitoSub,
      idempotencyKey: claimed.value.idempotencyKey,
      mdiPatientId: status.value.linkage.mdiPatientId,
      now,
      status: "case_provider_terminal_failure",
    });
    if (!recorded.ok) {
      return recorded;
    }
    return fail("provider_unavailable", "MDI case response did not match patient linkage", {
      retryable: false,
      status: 502,
    });
  }

  const saved = await deps.repository.saveSubmitted({
    cognitoSub: input.cognitoSub,
    idempotencyKey: claimed.value.idempotencyKey,
    linkage: created.value.linkage,
    now,
    submissionId: created.value.submissionId,
  });
  if (!saved.ok) {
    const recorded = await deps.repository.recordFailure({
      cognitoSub: input.cognitoSub,
      idempotencyKey: claimed.value.idempotencyKey,
      mdiCaseId: created.value.linkage.mdiCaseId,
      mdiPatientId: status.value.linkage.mdiPatientId,
      now,
      status: "case_storage_retryable_failure",
    });
    return recorded.ok ? saved : recorded;
  }

  return {
    ok: true,
    value: {
      status: "submitted",
      linkage: saved.value,
      ...(created.value.submissionId
        ? { submissionId: created.value.submissionId }
        : {}),
    },
  };
}

export function createAppDataMdiIntakeRepository(
  repository: AppDataRepository,
): MdiIntakeRepository {
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
      const attempt = getMdiCaseCreateAttempt(repository, cognitoSub);
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
      const linkage = getMdiLinkage(repository, input.cognitoSub);
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }
      if (!linkage.value || linkage.value.mdiPatientId !== input.mdiPatientId) {
        return fail("not_ready", "MDI patient linkage is not ready for case creation", {
          retryable: false,
          status: 409,
        });
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

      const attempt = getMdiCaseCreateAttempt(repository, input.cognitoSub);
      if (!attempt.ok) {
        return storageFailure(attempt.error.message);
      }
      const idempotencyKey = attempt.value?.idempotencyKey ??
        createMdiCaseIdempotencyKey(input.cognitoSub);

      if (!attempt.value) {
        const created = repository.put(createMdiCaseCreateAttemptRecord({
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
      const attempt = getMdiCaseCreateAttempt(repository, input.cognitoSub);
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
        status: input.status,
        updatedAt: input.now,
      };
      const saved = attempt.value
        ? repository.update(next, { expected: attempt.value })
        : repository.put(next, { ifNotExists: true });
      return saved.ok ? { ok: true, value: saved.value } : storageFailure(saved.error.message);
    },
    async saveSubmitted(input) {
      const linkage = linkMdiCaseIfAbsent(repository, {
        cognitoSub: input.cognitoSub,
        mdiCaseId: input.linkage.mdiCaseId,
        mdiPatientId: input.linkage.mdiPatientId,
        now: input.now,
      });
      if (!linkage.ok) {
        return storageFailure(linkage.error.message);
      }

      const attempt = getMdiCaseCreateAttempt(repository, input.cognitoSub);
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
        ? repository.update(next, { expected: attempt.value })
        : repository.put(next, { ifNotExists: true });
      if (!saved.ok) {
        return storageFailure(saved.error.message);
      }

      const transitioned = transitionOnboardingStatus(repository, {
        cognitoSub: input.cognitoSub,
        expected: "intake_ready",
        next: "mdi_submitted",
        now: input.now,
      });
      if (!transitioned.ok && transitioned.error.kind !== "stale_transition") {
        return storageFailure(transitioned.error.message);
      }
      if (!transitioned.ok) {
        const profile = getPatientProfile(repository, input.cognitoSub);
        if (!profile.ok) {
          return storageFailure(profile.error.message);
        }
        if (!isSubmittedStatus(profile.value?.onboardingStatus)) {
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

export function createMdiCaseIdempotencyKey(cognitoSub: string) {
  return `mdi-case-${createHash("sha256")
    .update(`mdi-case:${cognitoSub}`)
    .digest("hex")
    .slice(0, 32)}`;
}

export function mdiIntakeFailure(
  code: MdiIntakeErrorCode,
  message: string,
  options: { retryable?: boolean; status?: number } = {},
): MdiIntakeResult<never> {
  return fail(code, message, {
    retryable: options.retryable ?? false,
    status: options.status ?? 400,
  });
}

async function saveExistingCaseSubmission(input: {
  cognitoSub: string;
  idempotencyKey: string;
  mdiCaseId: string;
  mdiPatientId: string;
  now: string;
  repository: MdiIntakeRepository;
}): Promise<MdiIntakeResult<MdiIntakeSubmission>> {
  const saved = await input.repository.saveSubmitted({
    cognitoSub: input.cognitoSub,
    idempotencyKey: input.idempotencyKey,
    linkage: {
      mdiCaseId: input.mdiCaseId,
      mdiPatientId: input.mdiPatientId,
    },
    now: input.now,
  });
  if (!saved.ok) {
    const recorded = await input.repository.recordFailure({
      cognitoSub: input.cognitoSub,
      idempotencyKey: input.idempotencyKey,
      mdiCaseId: input.mdiCaseId,
      mdiPatientId: input.mdiPatientId,
      now: input.now,
      status: "case_storage_retryable_failure",
    });
    return recorded.ok ? saved : recorded;
  }

  return {
    ok: true,
    value: {
      linkage: saved.value,
      status: "submitted",
    },
  };
}

function validateSubmissionInput(input: {
  casePayload: MdiCasePayload;
  cognitoSub: string;
  questionnaireId: string;
  responses: MdiIntakeResponse[];
}): MdiIntakeResult<true> {
  if (
    !input.cognitoSub.trim() ||
    !input.questionnaireId.trim() ||
    !isRecord(input.casePayload) ||
    !Array.isArray(input.responses)
  ) {
    return fail("invalid_input", "MDI intake submission is incomplete", {
      retryable: false,
      status: 400,
    });
  }

  for (const response of input.responses) {
    if (!response || typeof response.questionId !== "string" || !response.questionId.trim()) {
      return fail("invalid_input", "MDI intake response is malformed", {
        retryable: false,
        status: 400,
      });
    }
  }

  return { ok: true, value: true };
}

function isSubmittedStatus(
  status: MdiIntakeRepositoryStatus["onboardingStatus"] | OnboardingStatus | undefined,
): status is "mdi_submitted" | "clinical_review" | "billing_ready" {
  return status === "mdi_submitted" ||
    status === "clinical_review" ||
    status === "billing_ready";
}

function storageFailure(message: string): MdiIntakeResult<never> {
  return fail("storage_failed", message, { retryable: true, status: 500 });
}

function fail(
  code: MdiIntakeErrorCode,
  message: string,
  options: { retryable: boolean; status: number },
): MdiIntakeResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: options.retryable,
      status: options.status,
    },
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const mdiCaseClaimLeaseMs = 15 * 60 * 1000;
