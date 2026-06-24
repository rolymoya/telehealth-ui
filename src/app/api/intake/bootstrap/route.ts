import { type NextRequest } from "next/server";
import {
  csrfTokenFor,
  noStoreJson,
  readPatientRouteSession,
  resolveAppDataRepository,
} from "@/app/api/_shared/onboarding";
import { currentConsentVersion } from "@/lib/consents";
import { readOnboardingGateSnapshotAsync } from "@/lib/onboarding-status";

export async function GET(request: NextRequest) {
  const session = await readPatientRouteSession(request, "intake_unavailable");
  if (!session.ok) {
    return noStoreJson(session.body, session.status);
  }

  const repository = resolveAppDataRepository(process.env);
  if (!repository.ok) {
    return noStoreJson({ error: "intake_unavailable" }, 503);
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    consentVersion: currentConsentVersion,
  });
  if (!snapshot.ok) {
    return noStoreJson({ error: "intake_unavailable" }, 503);
  }
  if (!snapshot.value.consentAccepted) {
    return noStoreJson({
      code: "consent_required",
      redirect: "/onboarding/consent",
    }, 403);
  }

  return noStoreJson({
    csrfToken: csrfTokenFor("intake-precheck", session.value.token),
    ...(snapshot.value.onboardingStatus
      ? {
          profile: {
            onboardingStatus: snapshot.value.onboardingStatus,
            ...(snapshot.value.residencyState
              ? { residencyState: snapshot.value.residencyState }
              : {}),
          },
        }
      : {}),
    status: "ready_for_precheck",
  });
}
