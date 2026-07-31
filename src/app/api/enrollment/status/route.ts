import type { NextRequest } from "next/server";
import { noStoreJson } from "@/app/api/_shared/onboarding";
import { resolveEnrollmentRequestContext } from "@/app/api/enrollment/_shared";
import { readEnrollmentStatus } from "@/lib/enrollment/checkout-service";

export async function GET(request: NextRequest) {
  const context = await resolveEnrollmentRequestContext(request);
  if (!context.ok) {
    return noStoreJson({ error: "enrollment_required" }, 401);
  }
  const result = await readEnrollmentStatus({
    enrollmentId: context.enrollmentId,
    now: new Date().toISOString(),
    repository: context.repository,
  });
  return result.ok
    ? noStoreJson({
        identityBound: result.identityBound,
        paymentSetupComplete: result.paymentSetupComplete,
        status: result.status,
      })
    : noStoreJson(
        { error: result.code },
        result.code === "enrollment_expired" ? 409 : 503,
      );
}
