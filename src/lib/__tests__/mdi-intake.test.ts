import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createMdiCaseCreateAttemptRecord,
  createPatientProfileRecord,
  getMdiCaseCreateAttempt,
  linkMdiPatientCase,
  mdiLinkageKey,
  patientProfileKey,
} from "@/lib/dynamodb/app-data";
import {
  createAppDataMdiIntakeRepository,
  createMdiCaseIdempotencyKey,
  loadMdiIntake,
  mdiIntakeFailure,
  submitMdiIntake,
  type MdiIntakeGateway,
  type MdiIntakeQuestionnaire,
  type MdiIntakeRepository,
  type MdiIntakeRepositoryStatus,
} from "@/lib/mdi-intake";
import questionnaireFlow from "../../../tests/fixtures/mdi/questionnaire-flow.json";

const cognitoSub = "cognito-sub-mdiintake";
const now = "2026-06-20T22:15:00.000Z";
const mdiPatientId = "mdi_patient_intake_001";
const mdiCaseId = "mdi_case_intake_001";
const fixtureQuestionnaire = {
  ...(questionnaireFlow.questionnaire as MdiIntakeQuestionnaire),
  patientId: mdiPatientId,
};
const casePayload = {
  case_questions: [
    {
      answer: "ANSWER_VALUE_SENTINEL",
      question: "QUESTION_TEXT_SENTINEL",
      type: "single_select",
    },
  ],
  diseases: [{ disease_id: "mdi_disease_transient_001" }],
};
const responses = [
  {
    questionId: fixtureQuestionnaire.questions[0].questionId,
    value: "ANSWER_VALUE_SENTINEL",
  },
];

describe("MDI intake orchestration", () => {
  it("loads questions only after precheck is complete", async () => {
    const gateway = gatewayWithQuestionnaire();
    const repository = repositoryWithStatus({ onboardingStatus: "intake_ready" });

    await expect(loadMdiIntake({ cognitoSub }, { gateway, repository }))
      .resolves.toMatchObject({
        ok: true,
        value: {
          status: "ready",
          questionnaire: {
            questionnaireId: fixtureQuestionnaire.questionnaireId,
            questions: expect.arrayContaining([
              expect.objectContaining({
                text: "QUESTION_TEXT_SENTINEL",
              }),
            ]),
          },
        },
      });
    expect(gateway.loadQuestionnaire).toHaveBeenCalledWith({ cognitoSub });
  });

  it("reports completed status from pointers without reloading saved answers", async () => {
    const gateway = gatewayWithQuestionnaire();
    const repository = repositoryWithStatus({
      onboardingStatus: "mdi_submitted",
      linkage: {
        mdiPatientId,
        mdiCaseId,
      },
    });

    await expect(loadMdiIntake({ cognitoSub }, { gateway, repository }))
      .resolves.toEqual({
        ok: true,
        value: {
          status: "submitted",
          linkage: {
            mdiPatientId,
            mdiCaseId,
          },
        },
      });
    expect(gateway.loadQuestionnaire).not.toHaveBeenCalled();
  });

  it("creates a case from transient responses and persists only MDI pointers", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId,
      now,
    });
    const createCase = vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: input.patientId,
          mdiCaseId,
        },
        submissionId: "mdi_submission_opaque_001",
      },
    }));

    const result = await submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({ createCase }),
        now: () => new Date(now),
        repository: createAppDataMdiIntakeRepository(repository),
      },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        status: "submitted",
        linkage: {
          mdiPatientId,
          mdiCaseId,
        },
        submissionId: "mdi_submission_opaque_001",
      },
    });
    expect(createCase).toHaveBeenCalledWith({
      casePayload,
      cognitoSub,
      idempotencyKey: createMdiCaseIdempotencyKey(cognitoSub),
      patientId: mdiPatientId,
      questionnaireId: fixtureQuestionnaire.questionnaireId,
      responses,
    });
    expect(repository.get(mdiLinkageKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        mdiCaseId,
        mdiPatientId,
      },
    });
    expect(getMdiCaseCreateAttempt(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        mdiCaseId,
        mdiPatientId,
        mdiSubmissionId: "mdi_submission_opaque_001",
        status: "submitted",
      },
    });

    const stored = repository.queryByKeyPrefix({
      pk: patientProfileKey(cognitoSub).pk,
      skPrefix: "",
    });
    expect(JSON.stringify(stored)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(stored)).not.toContain("QUESTION_TEXT_SENTINEL");
    expect(JSON.stringify(stored)).not.toContain("mdi_disease_transient_001");
  });

  it("does not create another case when a case pointer already exists", async () => {
    const createCase = vi.fn();
    const gateway = gatewayWithQuestionnaire({ createCase });
    const repository = repositoryWithStatus({
      onboardingStatus: "clinical_review",
      linkage: {
        mdiPatientId,
        mdiCaseId,
      },
    });

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      { gateway, repository },
    )).resolves.toMatchObject({
      ok: true,
      value: {
        status: "submitted",
      },
    });
    expect(createCase).not.toHaveBeenCalled();
  });

  it("links a stored case pointer after retryable storage failure before provider calls", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId,
      now,
    });
    repository.put(createMdiCaseCreateAttemptRecord({
      attempts: 1,
      cognitoSub,
      idempotencyKey: "mdi-case-existing-key",
      lastAttemptAt: now,
      mdiCaseId,
      mdiPatientId,
      now,
      status: "case_storage_retryable_failure",
    }));
    const createCase = vi.fn();

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({ createCase }),
        now: () => new Date("2026-06-20T22:30:00.000Z"),
        repository: createAppDataMdiIntakeRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: true,
      value: {
        linkage: {
          mdiCaseId,
          mdiPatientId,
        },
      },
    });
    expect(createCase).not.toHaveBeenCalled();
  });

  it("retries an expired case claim with the same idempotency key", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId,
      now,
    });
    repository.put(createMdiCaseCreateAttemptRecord({
      attempts: 1,
      claimExpiresAt: "2026-06-20T22:20:00.000Z",
      cognitoSub,
      idempotencyKey: "mdi-case-expired-key",
      lastAttemptAt: now,
      mdiPatientId,
      now,
      status: "claiming_case",
    }));
    const createCase = vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiCaseId,
          mdiPatientId: input.patientId,
        },
      },
    }));

    await submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({ createCase }),
        now: () => new Date("2026-06-20T22:30:00.000Z"),
        repository: createAppDataMdiIntakeRepository(repository),
      },
    );

    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "mdi-case-expired-key",
    }));
  });

  it("records provider-created case IDs when local submitted storage fails", async () => {
    const recordFailure = vi.fn(async () => ({
      ok: true as const,
      value: createMdiCaseCreateAttemptRecord({
        attempts: 1,
        cognitoSub,
        idempotencyKey: "mdi-case-claim",
        mdiCaseId,
        mdiPatientId,
        now,
        status: "case_storage_retryable_failure",
      }),
    }));
    const repository: MdiIntakeRepository = {
      claimSubmission: vi.fn(async () => ({
        ok: true as const,
        value: {
          idempotencyKey: "mdi-case-claim",
          outcome: "claimed" as const,
        },
      })),
      getStatus: vi.fn(async () => ({
        ok: true as const,
        value: {
          linkage: { mdiPatientId },
          onboardingStatus: "intake_ready" as const,
        },
      })),
      recordFailure,
      saveSubmitted: vi.fn(async () =>
        mdiIntakeFailure("storage_failed", "DynamoDB unavailable", {
          retryable: true,
          status: 500,
        })
      ),
    };

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({
          createCase: vi.fn(async () => ({
            ok: true as const,
            value: {
              linkage: { mdiCaseId, mdiPatientId },
            },
          })),
        }),
        now: () => new Date(now),
        repository,
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "storage_failed",
      },
    });

    expect(recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      mdiCaseId,
      status: "case_storage_retryable_failure",
    }));
  });

  it("does not persist a provider case when the returned patient pointer mismatches", async () => {
    const recordFailure = vi.fn(async () => ({
      ok: true as const,
      value: createMdiCaseCreateAttemptRecord({
        attempts: 1,
        cognitoSub,
        idempotencyKey: "mdi-case-claim",
        mdiPatientId,
        now,
        status: "case_provider_terminal_failure",
      }),
    }));
    const repository: MdiIntakeRepository = {
      claimSubmission: vi.fn(async () => ({
        ok: true as const,
        value: {
          idempotencyKey: "mdi-case-claim",
          outcome: "claimed" as const,
        },
      })),
      getStatus: vi.fn(async () => ({
        ok: true as const,
        value: {
          linkage: { mdiPatientId },
          onboardingStatus: "intake_ready" as const,
        },
      })),
      recordFailure,
      saveSubmitted: vi.fn(),
    };

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({
          createCase: vi.fn(async () => ({
            ok: true as const,
            value: {
              linkage: {
                mdiCaseId,
                mdiPatientId: "mdi_patient_foreign_001",
              },
            },
          })),
        }),
        now: () => new Date(now),
        repository,
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        retryable: false,
      },
    });

    expect(repository.saveSubmitted).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith(expect.not.objectContaining({
      mdiCaseId,
    }));
    expect(recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      mdiPatientId,
      status: "case_provider_terminal_failure",
    }));
  });

  it("does not reuse a saved case attempt from a different MDI patient", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId,
      now,
    });
    repository.put(createMdiCaseCreateAttemptRecord({
      attempts: 1,
      cognitoSub,
      idempotencyKey: "mdi-case-existing-key",
      lastAttemptAt: now,
      mdiCaseId,
      mdiPatientId: "mdi_patient_foreign_001",
      now,
      status: "case_storage_retryable_failure",
    }));
    const createCase = vi.fn();

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({ createCase }),
        now: () => new Date("2026-06-20T22:30:00.000Z"),
        repository: createAppDataMdiIntakeRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "storage_failed",
      },
    });
    expect(createCase).not.toHaveBeenCalled();
  });

  it("keeps provider failures patient-safe and answer-free", async () => {
    const gateway = gatewayWithQuestionnaire({
      createCase: vi.fn(async () =>
        mdiIntakeFailure(
          "provider_unavailable",
          "MDI provider unavailable",
          { retryable: true, status: 503 },
        )
      ),
    });
    const repository = repositoryWithStatus({
      onboardingStatus: "intake_ready",
      linkage: {
        mdiPatientId,
      },
    });

    const result = await submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      { gateway, repository },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        status: 503,
      },
    });
    expect(JSON.stringify(result)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(result)).not.toContain("QUESTION_TEXT_SENTINEL");
  });

  it("retries maintenance case creation with the same opaque idempotency key", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId,
      now,
    });
    const createCase = vi
      .fn()
      .mockResolvedValueOnce(mdiIntakeFailure(
        "provider_unavailable",
        "MDI maintenance",
        { retryAfterSeconds: 300, retryable: true, status: 418 },
      ))
      .mockResolvedValueOnce({
        ok: true as const,
        value: {
          linkage: {
            mdiCaseId,
            mdiPatientId,
          },
        },
      });

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({ createCase }),
        now: () => new Date(now),
        repository: createAppDataMdiIntakeRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        retryAfterSeconds: 300,
        retryable: true,
        status: 418,
      },
    });

    expect(getMdiCaseCreateAttempt(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        attempts: 1,
        idempotencyKey: createMdiCaseIdempotencyKey(cognitoSub),
        providerStatus: 418,
        retryAfterSeconds: 300,
        status: "case_provider_retryable_failure",
      },
    });

    await expect(submitMdiIntake(
      {
        casePayload,
        cognitoSub,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses,
      },
      {
        gateway: gatewayWithQuestionnaire({ createCase }),
        now: () => new Date("2026-06-20T22:20:00.000Z"),
        repository: createAppDataMdiIntakeRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: true,
      value: {
        linkage: {
          mdiCaseId,
          mdiPatientId,
        },
      },
    });

    expect(createCase).toHaveBeenNthCalledWith(1, expect.objectContaining({
      idempotencyKey: createMdiCaseIdempotencyKey(cognitoSub),
    }));
    expect(createCase).toHaveBeenNthCalledWith(2, expect.objectContaining({
      idempotencyKey: createMdiCaseIdempotencyKey(cognitoSub),
    }));
    const stored = JSON.stringify(repository.queryByKeyPrefix({
      pk: patientProfileKey(cognitoSub).pk,
      skPrefix: "",
    }));
    expect(stored).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(stored).not.toContain("QUESTION_TEXT_SENTINEL");
  });
});

function gatewayWithQuestionnaire(
  overrides: Partial<MdiIntakeGateway> = {},
): MdiIntakeGateway {
  return {
    createCase: vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: input.patientId,
          mdiCaseId,
        },
      },
    })),
    loadQuestionnaire: vi.fn(async () => ({
      ok: true as const,
      value: fixtureQuestionnaire,
    })),
    ...overrides,
  };
}

function repositoryWithStatus(
  status: MdiIntakeRepositoryStatus,
  overrides: Partial<MdiIntakeRepository> = {},
): MdiIntakeRepository {
  return {
    getStatus: vi.fn(async () => ({
      ok: true as const,
      value: status,
    })),
    claimSubmission: vi.fn(async () => ({
      ok: true as const,
      value: {
        idempotencyKey: "mdi-case-idempotency-key",
        outcome: "claimed" as const,
      },
    })),
    recordFailure: vi.fn(async () => ({
      ok: true as const,
      value: createMdiCaseCreateAttemptRecord({
        attempts: 1,
        cognitoSub,
        idempotencyKey: "mdi-case-idempotency-key",
        mdiPatientId,
        now,
        status: "case_provider_retryable_failure",
      }),
    })),
    saveSubmitted: vi.fn(async (input) => ({
      ok: true as const,
      value: input.linkage,
    })),
    ...overrides,
  };
}
