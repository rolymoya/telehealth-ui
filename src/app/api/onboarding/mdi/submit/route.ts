import { type NextRequest } from "next/server";
import {
  isRecord,
  noStoreJson,
  readJsonObject,
  resolveAppDataRepository,
  verifyJsonMutation,
} from "@/app/api/_shared/onboarding";
import { evaluateBillingDisclosureGate } from "@/lib/billing-disclosure-gate";
import { currentConsentVersion, requiredConsentsBeforeMdi } from "@/lib/consents";
import {
  mdiQuestionnaireContextCookieName,
  readMdiQuestionnaireContextCookie,
} from "@/lib/mdi-intake-context";
import { createDynamoDbMdiIntakeRepository } from "@/lib/mdi-intake-dynamodb";
import {
  createMdiHttpIntakeGateway,
  resolveMdiQuestionnaireId,
} from "@/lib/mdi-intake-gateway";
import {
  submitMdiIntake,
  type MdiCasePayload,
  type MdiIntakeResponse,
} from "@/lib/mdi-intake";
import { readOnboardingGateSnapshotAsync } from "@/lib/onboarding-status";

export async function POST(request: NextRequest) {
  const session = await verifyJsonMutation(request, {
    csrfScope: "mdi-intake",
    unavailableCode: "mdi_unavailable",
  });
  if (!session.ok) {
    return noStoreJson(session.body, session.status);
  }

  const repository = resolveAppDataRepository(process.env);
  if (!repository.ok) {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    consentVersion: currentConsentVersion,
    requiredConsents: requiredConsentsBeforeMdi(),
  });
  if (!snapshot.ok) {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }
  if (!snapshot.value.consentAccepted) {
    return noStoreJson({
      code: "consent_required",
      redirect: "/onboarding/consent",
    }, 403);
  }

  const expectedQuestionnaireId = readMdiQuestionnaireContextCookie({
    sessionToken: session.value.token,
    value: request.cookies.get(mdiQuestionnaireContextCookieName)?.value,
  }) ?? resolveMdiQuestionnaireId(process.env);
  if (!expectedQuestionnaireId) {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }

  const parsed = parseSubmissionBody(await readJsonObject(request));
  if (!parsed.ok) {
    return noStoreJson({ code: "invalid_input" }, 400);
  }

  const result = await submitMdiIntake(
    {
      cognitoSub: session.value.session.user.cognitoSub,
      ...parsed.value,
    },
    {
      expectedQuestionnaireId,
      gateway: createMdiHttpIntakeGateway(),
      repository: createDynamoDbMdiIntakeRepository(repository.value),
    },
  );
  if (!result.ok) {
    return noStoreJson(mdiErrorBody(result.error.code), result.error.status);
  }

  const disclosureGate = await evaluateBillingDisclosureGate(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
  });
  if (disclosureGate.status === "storage_unavailable") {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }

  return noStoreJson({
    linkage: result.value.linkage,
    ...(disclosureGate.status === "medication_disclosure_required"
      ? { redirect: "/onboarding/consent?gate=medication" }
      : disclosureGate.status === "treatment_selection_required"
        ? { redirect: "/onboarding/mdi" }
        : {}),
    status: result.value.status,
  });
}

function parseSubmissionBody(value: Record<string, unknown> | null):
  | {
      ok: true;
      value: {
        casePayload: MdiCasePayload;
        questionnaireId: string;
        responses: MdiIntakeResponse[];
      };
    }
  | { ok: false } {
  if (!value || typeof value.questionnaireId !== "string" || !isRecord(value.casePayload)) {
    return { ok: false };
  }
  if (!Array.isArray(value.responses)) {
    return { ok: false };
  }

  const responses: MdiIntakeResponse[] = [];
  for (const response of value.responses) {
    if (!isRecord(response) || typeof response.questionId !== "string") {
      return { ok: false };
    }
    responses.push({
      questionId: response.questionId,
      value: response.value,
    });
  }

  return {
    ok: true,
    value: {
      casePayload: value.casePayload,
      questionnaireId: value.questionnaireId,
      responses,
    },
  };
}

function mdiErrorBody(code: string) {
  return {
    code,
    ...(code === "precheck_required" ? { redirect: "/intake" } : {}),
  };
}
