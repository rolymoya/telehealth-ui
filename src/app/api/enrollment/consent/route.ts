import type { NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
} from "@/app/api/_shared/onboarding";
import { resolveEnrollmentRequestContext } from "@/app/api/enrollment/_shared";
import {
  checkoutConsentVersion,
  recordEnrollmentConsent,
} from "@/lib/enrollment/checkout-service";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ error: "invalid_content_type" }, 415);
  }
  const context = await resolveEnrollmentRequestContext(request);
  if (!context.ok) {
    return noStoreJson({ error: "enrollment_required" }, 401);
  }
  const body = await readJsonObject(request);
  if (body?.consentVersion !== checkoutConsentVersion) {
    return noStoreJson({ error: "consent_version_invalid" }, 409);
  }
  const result = await recordEnrollmentConsent({
    consentVersion: body.consentVersion,
    enrollmentId: context.enrollmentId,
    now: new Date().toISOString(),
    repository: context.repository,
  });
  return result.ok
    ? noStoreJson({
        acceptedAt: result.acceptedAt,
        consentVersion: result.consentVersion,
        status: "consent_recorded",
      })
    : noStoreJson(
        { error: result.code },
        result.code === "enrollment_expired" ? 409 : 503,
      );
}
