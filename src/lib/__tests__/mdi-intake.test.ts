import { describe, expect, it, vi } from "vitest";
import {
  loadMdiIntake,
  mdiIntakeFailure,
  submitMdiIntake,
  type MdiIntakeGateway,
  type MdiIntakeQuestionnaire,
  type MdiIntakeRepository,
  type MdiIntakeRepositoryStatus,
} from "@/lib/mdi-intake";
import questionnaireFlow from "../../../tests/fixtures/mdi/questionnaire-flow.json";

const cognitoSub = "cognito-sub-mdi-intake";
const now = "2026-06-10T22:15:00.000Z";
const fixtureQuestionnaire = questionnaireFlow.questionnaire as MdiIntakeQuestionnaire;

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
        mdiPatientId: fixtureQuestionnaire.patientId,
        mdiCaseId: fixtureQuestionnaire.caseId,
      },
    });

    await expect(loadMdiIntake({ cognitoSub }, { gateway, repository }))
      .resolves.toEqual({
        ok: true,
        value: {
          status: "submitted",
          linkage: {
            mdiPatientId: fixtureQuestionnaire.patientId,
            mdiCaseId: fixtureQuestionnaire.caseId,
          },
        },
      });
    expect(gateway.loadQuestionnaire).not.toHaveBeenCalled();
  });

  it("submits transient responses and persists only MDI pointers", async () => {
    const saved: unknown[] = [];
    const submitResponses = vi.fn(async () => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: fixtureQuestionnaire.patientId,
          mdiCaseId: fixtureQuestionnaire.caseId,
        },
        submissionId: "mdi_submission_opaque_001",
      },
    }));
    const gateway = gatewayWithQuestionnaire({ submitResponses });
    const repository = repositoryWithStatus(
      {
        onboardingStatus: "intake_ready",
        linkage: {
          mdiPatientId: fixtureQuestionnaire.patientId,
          mdiCaseId: fixtureQuestionnaire.caseId,
        },
      },
      {
        saveSubmitted: vi.fn(async (input) => {
          saved.push(input);
          return { ok: true as const, value: input.linkage };
        }),
      },
    );

    const result = await submitMdiIntake(
      {
        cognitoSub,
        caseId: fixtureQuestionnaire.caseId,
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      {
        gateway,
        repository,
        now: () => new Date(now),
      },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        status: "submitted",
        linkage: {
          mdiPatientId: fixtureQuestionnaire.patientId,
          mdiCaseId: fixtureQuestionnaire.caseId,
        },
        submissionId: "mdi_submission_opaque_001",
      },
    });
    expect(JSON.stringify(submitResponses.mock.calls)).toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(saved)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(saved)).not.toContain("QUESTION_TEXT_SENTINEL");
    expect(saved).toEqual([
      {
        cognitoSub,
        linkage: {
          mdiPatientId: fixtureQuestionnaire.patientId,
          mdiCaseId: fixtureQuestionnaire.caseId,
        },
        now,
      },
    ]);
  });

  it("does not resubmit if DynamoDB already has the handoff pointer", async () => {
    const submitResponses = vi.fn();
    const gateway = gatewayWithQuestionnaire({ submitResponses });
    const repository = repositoryWithStatus({
      onboardingStatus: "clinical_review",
      linkage: {
        mdiPatientId: fixtureQuestionnaire.patientId,
        mdiCaseId: fixtureQuestionnaire.caseId,
      },
    });

    await expect(submitMdiIntake(
      {
        cognitoSub,
        caseId: fixtureQuestionnaire.caseId,
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      { gateway, repository },
    )).resolves.toMatchObject({
      ok: true,
      value: {
        status: "submitted",
      },
    });
    expect(submitResponses).not.toHaveBeenCalled();
  });

  it("does not submit upstream when another request already claimed submission", async () => {
    const submitResponses = vi.fn();
    const gateway = gatewayWithQuestionnaire({ submitResponses });
    const repository = repositoryWithStatus(
      {
        onboardingStatus: "intake_ready",
        linkage: {
          mdiPatientId: fixtureQuestionnaire.patientId,
          mdiCaseId: fixtureQuestionnaire.caseId,
        },
      },
      {
        claimSubmission: vi.fn(async () =>
          mdiIntakeFailure(
            "submission_in_progress",
            "MDI intake submission is already in progress",
            { retryable: true, status: 409 },
          )
        ),
      },
    );

    await expect(submitMdiIntake(
      {
        cognitoSub,
        caseId: fixtureQuestionnaire.caseId,
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      { gateway, repository },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "submission_in_progress",
      },
    });
    expect(submitResponses).not.toHaveBeenCalled();
  });

  it("rejects tampered MDI pointers before calling the gateway", async () => {
    const submitResponses = vi.fn();
    const gateway = gatewayWithQuestionnaire({ submitResponses });
    const repository = repositoryWithStatus({
      onboardingStatus: "intake_ready",
      linkage: {
        mdiPatientId: fixtureQuestionnaire.patientId,
        mdiCaseId: fixtureQuestionnaire.caseId,
      },
    });

    await expect(submitMdiIntake(
      {
        cognitoSub,
        caseId: "mdi_case_tampered",
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      { gateway, repository },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
      },
    });
    expect(repository.claimSubmission).not.toHaveBeenCalled();
    expect(submitResponses).not.toHaveBeenCalled();
  });

  it("rejects tampered questionnaire IDs before claiming submission", async () => {
    const submitResponses = vi.fn();
    const gateway = gatewayWithQuestionnaire({ submitResponses });
    const repository = repositoryWithStatus({
      onboardingStatus: "intake_ready",
      linkage: {
        mdiPatientId: fixtureQuestionnaire.patientId,
        mdiCaseId: fixtureQuestionnaire.caseId,
      },
    });

    await expect(submitMdiIntake(
      {
        cognitoSub,
        caseId: fixtureQuestionnaire.caseId,
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: "mdi_questionnaire_tampered",
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      {
        expectedQuestionnaireId: fixtureQuestionnaire.questionnaireId,
        gateway,
        repository,
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
      },
    });
    expect(repository.getStatus).not.toHaveBeenCalled();
    expect(repository.claimSubmission).not.toHaveBeenCalled();
    expect(submitResponses).not.toHaveBeenCalled();
  });

  it("passes the claim idempotency key to the MDI gateway", async () => {
    const submitResponses = vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: input.patientId,
          mdiCaseId: input.caseId,
        },
      },
    }));
    const gateway = gatewayWithQuestionnaire({ submitResponses });
    const repository = repositoryWithStatus({
      onboardingStatus: "intake_ready",
      linkage: {
        mdiPatientId: fixtureQuestionnaire.patientId,
        mdiCaseId: fixtureQuestionnaire.caseId,
      },
    });

    await submitMdiIntake(
      {
        cognitoSub,
        caseId: fixtureQuestionnaire.caseId,
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      { gateway, repository },
    );

    expect(submitResponses).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "mdi-intake-idempotency-key",
    }));
  });

  it("keeps provider failures patient-safe and answer-free", async () => {
    const gateway = gatewayWithQuestionnaire({
      submitResponses: vi.fn(async () =>
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
        mdiPatientId: fixtureQuestionnaire.patientId,
        mdiCaseId: fixtureQuestionnaire.caseId,
      },
    });

    const result = await submitMdiIntake(
      {
        cognitoSub,
        caseId: fixtureQuestionnaire.caseId,
        patientId: fixtureQuestionnaire.patientId,
        questionnaireId: fixtureQuestionnaire.questionnaireId,
        responses: [
          {
            questionId: fixtureQuestionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
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
  });
});

function gatewayWithQuestionnaire(
  overrides: Partial<MdiIntakeGateway> = {},
): MdiIntakeGateway {
  return {
    loadQuestionnaire: vi.fn(async () => ({
      ok: true as const,
      value: fixtureQuestionnaire,
    })),
    submitResponses: vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: input.patientId,
          mdiCaseId: input.caseId,
        },
      },
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
        claimed: true as const,
        idempotencyKey: "mdi-intake-idempotency-key",
      },
    })),
    saveSubmitted: vi.fn(async (input) => ({
      ok: true as const,
      value: input.linkage,
    })),
    ...overrides,
  };
}
