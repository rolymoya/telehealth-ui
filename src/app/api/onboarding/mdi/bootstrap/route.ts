import { type NextRequest } from "next/server";
import {
  csrfTokenFor,
  noStoreJson,
  readPatientRouteSession,
  resolveAppDataRepository,
} from "@/app/api/_shared/onboarding";
import { currentConsentVersion } from "@/lib/consents";
import { createDynamoDbMdiIntakeRepository } from "@/lib/mdi-intake-dynamodb";
import { createMdiHttpIntakeGateway } from "@/lib/mdi-intake-gateway";
import { loadMdiIntake } from "@/lib/mdi-intake";
import { readOnboardingGateSnapshotAsync } from "@/lib/onboarding-status";

export async function GET(request: NextRequest) {
  const session = await readPatientRouteSession(request, "mdi_unavailable");
  if (!session.ok) {
    return noStoreJson(errorBody(session.body), session.status);
  }

  const repository = resolveAppDataRepository(process.env);
  if (!repository.ok) {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    consentVersion: currentConsentVersion,
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

  const result = await loadMdiIntake(
    { cognitoSub: session.value.session.user.cognitoSub },
    {
      gateway: createMdiHttpIntakeGateway(),
      repository: createDynamoDbMdiIntakeRepository(repository.value),
    },
  );
  if (!result.ok) {
    return noStoreJson(mdiErrorBody(result.error.code), result.error.status);
  }

  return noStoreJson({
    csrfToken: csrfTokenFor("mdi-intake", session.value.token),
    ...result.value,
  });
}

function errorBody(body: Record<string, unknown>) {
  return typeof body.error === "string"
    ? { code: body.error }
    : body;
}

function mdiErrorBody(code: string) {
  return {
    code,
    ...(code === "precheck_required" ? { redirect: "/intake" } : {}),
  };
}
