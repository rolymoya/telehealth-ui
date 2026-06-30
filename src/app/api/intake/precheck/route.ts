import { type NextRequest } from "next/server";
import {
  csrfTokenFor,
  hasPatientRouteCookie,
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
  resolveAppDataRepository,
  verifyJsonMutation,
} from "@/app/api/_shared/onboarding";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";
import { currentConsentVersion, requiredConsentsBeforeMdi } from "@/lib/consents";
import { completeIntakePrecheckProfileDynamoDb } from "@/lib/intake-profile-dynamodb";
import { readOnboardingGateSnapshotAsync } from "@/lib/onboarding-status";
import {
  anonymousPrecheckContextSetCookieHeader,
  createAnonymousPrecheckContext,
  privacyNoticeGateCookieName,
  verifyPrivacyNoticeGateContext,
} from "../../../../../shared/intake/anonymous-precheck-context";
import { screenIntakePrecheck } from "../../../../../shared/intake/precheck";

export async function POST(request: NextRequest) {
  if (!hasPatientRouteCookie(request)) {
    return anonymousPrecheck(request);
  }

  const session = await verifyJsonMutation(request, {
    csrfScope: "intake-precheck",
    unavailableCode: "intake_unavailable",
  });
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

  const body = await readJsonObject(request);
  const decision = screenIntakePrecheck(body ?? {});
  if (!decision.ok) {
    return noStoreJson({
      code: decision.error.reason,
      outcome: decision.error.outcome,
    }, decision.error.outcome === "incomplete" ? 400 : 409);
  }

  const profile = await completeIntakePrecheckProfileDynamoDb(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    now: new Date().toISOString(),
    residencyState: decision.value.residencyState,
  });
  if (!profile.ok) {
    return noStoreJson({
      code: profile.error.kind === "stale_transition"
        ? "precheck_conflict"
        : "storage_unavailable",
    }, profile.error.kind === "stale_transition" ? 409 : 503);
  }

  return noStoreJson({
    mdiPatientCsrfToken: csrfTokenFor("mdi-patient", session.value.token),
    profile: {
      onboardingStatus: profile.value.onboardingStatus,
      ...(profile.value.residencyState
        ? { residencyState: profile.value.residencyState }
        : {}),
    },
    status: "ready_for_mdi_intake",
  });
}

async function anonymousPrecheck(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ code: "invalid_content_type" }, 415);
  }

  const secret = await resolveAppSigningSecret(process.env);
  if (!secret.ok) {
    return noStoreJson({ error: "intake_unavailable" }, 503);
  }

  const privacyCookie = request.cookies.get(privacyNoticeGateCookieName)?.value ?? "";
  const privacyContext = verifyPrivacyNoticeGateContext({
    secret: secret.value,
    value: privacyCookie,
  });
  if (!privacyContext.ok) {
    return noStoreJson({
      code: "privacy_notice_required",
      redirect: "/onboarding/consent",
    }, 403);
  }

  const csrf = request.headers.get("x-apoth-csrf") ?? "";
  if (csrf !== csrfTokenFor("intake-precheck", privacyCookie)) {
    return noStoreJson({ code: "invalid_csrf" }, 403);
  }

  const body = await readJsonObject(request);
  const decision = screenIntakePrecheck(body ?? {});
  if (!decision.ok) {
    return noStoreJson({
      code: decision.error.reason,
      outcome: decision.error.outcome,
    }, decision.error.outcome === "incomplete" ? 400 : 409);
  }

  const context = createAnonymousPrecheckContext({
    privacyNoticeVersion: privacyContext.payload.privacyNoticeVersion,
    residencyState: decision.value.residencyState,
    secret: secret.value,
    selectedTreatment: decision.value.offering,
  });

  return noStoreJson({
    status: "ready_for_account_creation",
  }, 200, {
    "Set-Cookie": anonymousPrecheckContextSetCookieHeader(context),
  });
}
