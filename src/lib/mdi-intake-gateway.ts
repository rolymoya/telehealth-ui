import "server-only";

import {
  createMdiCase,
  getMdiQuestionnaireQuestions,
  type MdiClientError,
  type MdiClientOptions,
} from "@/lib/mdi/client";
import {
  mdiIntakeFailure,
  type MdiIntakeGateway,
  type MdiIntakeResult,
} from "@/lib/mdi-intake";

export function createMdiHttpIntakeGateway(input: {
  clientOptions?: MdiClientOptions;
  env?: Record<string, string | undefined>;
} = {}): MdiIntakeGateway {
  const env = input.env ?? process.env;
  const clientOptions = input.clientOptions ?? {};

  return {
    async loadQuestionnaire(questionnaireInput) {
      if (!questionnaireInput.linkage?.mdiPatientId) {
        return mdiIntakeFailure(
          "provider_unavailable",
          "MDI patient linkage is not available",
          { retryable: true, status: 503 },
        );
      }

      const questionnaireId = resolveMdiQuestionnaireId(env);
      if (!questionnaireId) {
        return mdiIntakeFailure(
          "provider_unavailable",
          "MDI questionnaire configuration is unavailable",
          { retryable: false, status: 503 },
        );
      }

      const questions = await getMdiQuestionnaireQuestions(questionnaireId, clientOptions);
      if (!questions.ok) {
        return mapMdiClientError(questions.error);
      }

      return {
        ok: true,
        value: {
          questionnaireId,
          patientId: questionnaireInput.linkage.mdiPatientId,
          ...(questionnaireInput.linkage.mdiCaseId
            ? { caseId: questionnaireInput.linkage.mdiCaseId }
            : {}),
          questions: questions.value,
        },
      };
    },
    async createCase(caseInput) {
      const created = await createMdiCase({
        casePayload: {
          ...caseInput.casePayload,
          patient_id: caseInput.patientId,
        },
        idempotencyKey: caseInput.idempotencyKey,
      }, clientOptions);
      if (!created.ok) {
        return mapMdiClientError(created.error);
      }

      return {
        ok: true,
        value: {
          linkage: {
            mdiCaseId: created.value.mdiCaseId,
            mdiPatientId: caseInput.patientId,
          },
        },
      };
    },
  };
}

export function resolveMdiQuestionnaireId(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.APOTH_MDI_QUESTIONNAIRE_ID?.trim();
  return value || null;
}

function mapMdiClientError(error: MdiClientError): MdiIntakeResult<never> {
  return mdiIntakeFailure(
    "provider_unavailable",
    "MDI provider request failed",
    {
      retryAfterSeconds: error.retryAfterSeconds,
      retryable: error.retryable,
      status: publicProviderStatus(error),
    },
  );
}

function publicProviderStatus(error: MdiClientError) {
  if (error.code === "maintenance") {
    return 503;
  }
  if (error.status === 429 || error.status === 418) {
    return 503;
  }
  if (error.status && error.status >= 500) {
    return 503;
  }
  if (error.code === "network_error" || error.code === "timeout") {
    return 503;
  }
  return 502;
}
