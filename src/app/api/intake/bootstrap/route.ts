import { type NextRequest } from "next/server";
import {
  csrfTokenFor,
  hasPatientRouteCookie,
  noStoreJson,
  readPatientRouteSession,
  resolveAppDataRepository,
} from "@/app/api/_shared/onboarding";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";
import { currentConsentVersion, requiredConsentsBeforeMdi } from "@/lib/consents";
import { readOnboardingGateSnapshotAsync } from "@/lib/onboarding-status";
import {
  privacyNoticeGateCookieName,
  verifyPrivacyNoticeGateContext,
} from "../../../../../shared/intake/anonymous-precheck-context";

export async function GET(request: NextRequest) {
  if (!hasPatientRouteCookie(request)) {
    return anonymousBootstrap(request);
  }

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
    requiredConsents: requiredConsentsBeforeMdi(),
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
    mdiPatientCsrfToken: csrfTokenFor("mdi-patient", session.value.token),
    mdiPatientLinked: Boolean(snapshot.value.mdiPatientId),
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

async function anonymousBootstrap(request: NextRequest) {
  const secret = await resolveAppSigningSecret(process.env);
  if (!secret.ok) {
    return noStoreJson({ error: "intake_unavailable" }, 503);
  }
  const privacyContext = verifyPrivacyNoticeGateContext({
    secret: secret.value,
    value: request.cookies.get(privacyNoticeGateCookieName)?.value,
  });
  if (!privacyContext.ok) {
    return noStoreJson({
      code: "privacy_notice_required",
      redirect: "/onboarding/consent",
    }, 403);
  }

  const contextToken = request.cookies.get(privacyNoticeGateCookieName)?.value ?? "";
  return noStoreJson({
    csrfToken: csrfTokenFor("intake-precheck", contextToken),
    status: "ready_for_anonymous_precheck",
  });
}
