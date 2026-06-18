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
  caseId: string;
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
  onboardingStatus?: MdiIntakeStatus;
  linkage?: MdiIntakeLinkage | null;
};

export type MdiIntakeRepository = {
  getStatus(cognitoSub: string): Promise<MdiIntakeResult<MdiIntakeRepositoryStatus>>;
  claimSubmission(input: {
    cognitoSub: string;
  }): Promise<MdiIntakeResult<{
    claimed: true;
    idempotencyKey: string;
  }>>;
  saveSubmitted(input: {
    cognitoSub: string;
    linkage: MdiIntakeLinkage;
    now: string;
  }): Promise<MdiIntakeResult<MdiIntakeLinkage>>;
};

export type MdiIntakeGateway = {
  loadQuestionnaire(input: {
    cognitoSub: string;
    linkage?: MdiIntakeLinkage | null;
  }): Promise<MdiIntakeResult<MdiIntakeQuestionnaire>>;
  submitResponses(input: {
    cognitoSub: string;
    questionnaireId: string;
    patientId: string;
    caseId: string;
    idempotencyKey?: string;
    responses: MdiIntakeResponse[];
  }): Promise<MdiIntakeResult<{
    linkage: MdiIntakeLinkage;
    submissionId?: string;
  }>>;
};

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
    gateway: MdiIntakeGateway;
    repository: MdiIntakeRepository;
  },
): Promise<MdiIntakeResult<MdiIntakeBootstrap>> {
  const status = await deps.repository.getStatus(input.cognitoSub);
  if (!status.ok) {
    return fail("storage_failed", "Could not load onboarding status", {
      retryable: true,
      status: 500,
    });
  }

  if (isSubmittedStatus(status.value.onboardingStatus)) {
    if (!status.value.linkage) {
      return fail("storage_failed", "MDI handoff status is missing linkage", {
        retryable: true,
        status: 500,
      });
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
    cognitoSub: string;
    questionnaireId: string;
    patientId: string;
    caseId: string;
    responses: MdiIntakeResponse[];
  },
  deps: {
    expectedQuestionnaireId?: string;
    gateway: MdiIntakeGateway;
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
    return fail("storage_failed", "Could not load onboarding status", {
      retryable: true,
      status: 500,
    });
  }
  if (isSubmittedStatus(status.value.onboardingStatus) && status.value.linkage) {
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
  if (
    !status.value.linkage?.mdiPatientId ||
    status.value.linkage.mdiPatientId !== input.patientId ||
    status.value.linkage.mdiCaseId !== input.caseId
  ) {
    return fail("not_ready", "MDI intake linkage did not match the current account", {
      retryable: false,
      status: 409,
    });
  }

  const claimed = await deps.repository.claimSubmission({
    cognitoSub: input.cognitoSub,
  });
  if (!claimed.ok) {
    return claimed;
  }

  const submitted = await deps.gateway.submitResponses({
    ...input,
    idempotencyKey: claimed.value.idempotencyKey,
  });
  if (!submitted.ok) {
    return submitted;
  }

  const saved = await deps.repository.saveSubmitted({
    cognitoSub: input.cognitoSub,
    linkage: submitted.value.linkage,
    now: (deps.now ?? (() => new Date()))().toISOString(),
  });
  if (!saved.ok) {
    return fail("storage_failed", "Could not save MDI handoff status", {
      retryable: true,
      status: 500,
    });
  }

  return {
    ok: true,
    value: {
      status: "submitted",
      linkage: saved.value,
      ...(submitted.value.submissionId
        ? { submissionId: submitted.value.submissionId }
        : {}),
    },
  };
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

function validateSubmissionInput(input: {
  questionnaireId: string;
  patientId: string;
  caseId: string;
  responses: MdiIntakeResponse[];
}): MdiIntakeResult<true> {
  if (
    !input.questionnaireId.trim() ||
    !input.patientId.trim() ||
    !input.caseId.trim() ||
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
  status: MdiIntakeRepositoryStatus["onboardingStatus"],
): status is "mdi_submitted" | "clinical_review" | "billing_ready" {
  return status === "mdi_submitted" ||
    status === "clinical_review" ||
    status === "billing_ready";
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
