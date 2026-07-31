import type { NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readPatientRouteSession,
} from "@/app/api/_shared/onboarding";
import { resolveEnrollmentRequestContext } from "@/app/api/enrollment/_shared";
import { bindVerifiedEnrollmentIdentity } from "@/lib/enrollment/checkout-service";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ error: "invalid_content_type" }, 415);
  }
  const [context, session] = await Promise.all([
    resolveEnrollmentRequestContext(request),
    readPatientRouteSession(request, "enrollment_unavailable"),
  ]);
  if (!context.ok) {
    return noStoreJson({ error: "enrollment_required" }, 401);
  }
  if (!session.ok) {
    return noStoreJson(
      session.status === 401
        ? { error: "authentication_required" }
        : { error: "enrollment_unavailable" },
      session.status,
    );
  }
  const result = await bindVerifiedEnrollmentIdentity({
    cognitoSub: session.value.session.user.cognitoSub,
    enrollmentId: context.enrollmentId,
    now: new Date().toISOString(),
    repository: context.repository,
  });
  return result.ok
    ? noStoreJson({
        redirect: result.redirect,
        status: result.status,
      })
    : noStoreJson(
        { error: result.code },
        result.code === "payment_setup_pending" ? 409 :
          result.code === "enrollment_already_bound" ? 403 :
            result.code === "enrollment_expired" ? 409 : 503,
      );
}
