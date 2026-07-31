import { type NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
} from "@/app/api/_shared/onboarding";
import { enrollmentAttemptCookieName } from "@/lib/enrollment/attempt-cookie";
import { resolveCognitoAuthConfig } from "@/lib/auth";
import { createDefaultCognitoEmailOtpAdapter } from "@/lib/enrollment/cognito-otp";
import { resolveEnrollmentCheckoutSecrets } from "@/lib/enrollment/checkout-runtime";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";
import {
  otpChallengeCookieHeader,
} from "@/lib/enrollment/otp-challenge-cookie";
import { startEnrollmentEmailOtp } from "@/lib/enrollment/otp-service";
import { createStripeClient } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ code: "invalid_content_type" }, 415);
  }
  if (request.headers.get("x-apoth-checkout-intent") !== "start-email-otp") {
    return noStoreJson({ code: "invalid_request_intent" }, 403);
  }
  if (process.env.APOTH_ENROLLMENT_BINDING_ENABLED !== "true") {
    return noStoreJson({ error: "verification_unavailable" }, 503);
  }

  const auth = resolveCognitoAuthConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!auth.ok || !database.ok || !secrets.ok || !secrets.value.identityFingerprint) {
    return noStoreJson({ error: "verification_unavailable" }, 503);
  }
  const cognito = createDefaultCognitoEmailOtpAdapter({
    region: auth.value.region,
    userPoolClientId: auth.value.userPoolClientId,
    userPoolId: auth.value.userPoolId,
  });
  const result = await startEnrollmentEmailOtp({
    attemptCookie: request.cookies.get(enrollmentAttemptCookieName)?.value,
    cognito,
    identitySecret: secrets.value.identityFingerprint,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    signingSecret: secrets.value.appSigning,
    stripe: createStripeClient(secrets.value.stripeApi),
  });
  if (!result.ok) {
    return noStoreJson(
      { error: result.code },
      result.code === "verification_not_ready" ? 409 : 503,
    );
  }
  return noStoreJson({
    status: result.status,
    transactionHandle: result.transactionHandle,
  }, 200, {
    "Set-Cookie": otpChallengeCookieHeader(result.challengeCookie),
  });
}
