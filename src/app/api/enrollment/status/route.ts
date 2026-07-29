import { type NextRequest } from "next/server";
import { noStoreJson } from "@/app/api/_shared/onboarding";
import { enrollmentAttemptCookieName } from "@/lib/enrollment/attempt-cookie";
import { readEnrollmentCheckoutStatus } from "@/lib/enrollment/checkout-completion";
import { resolveEnrollmentCheckoutSecrets } from "@/lib/enrollment/checkout-runtime";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";

export async function GET(request: NextRequest) {
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!database.ok || !secrets.ok) {
    return statusJson({ error: "status_unavailable" }, 503);
  }

  const result = await readEnrollmentCheckoutStatus({
    attemptCookie: request.cookies.get(enrollmentAttemptCookieName)?.value,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    signingSecret: secrets.value.appSigning,
  });
  if (!result.ok) {
    return result.code === "invalid_attempt"
      ? statusJson({ status: "restart_required" })
      : statusJson({ error: "status_unavailable" }, 503);
  }
  return statusJson({ status: result.status });
}

function statusJson(body: Record<string, unknown>, status = 200) {
  return noStoreJson(body, status, {
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}
