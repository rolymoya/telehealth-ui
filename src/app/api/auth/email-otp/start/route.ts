import { type NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
} from "@/app/api/_shared/onboarding";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";
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
import { startPrecheckEmailOtp } from "@/lib/enrollment/precheck-otp";
import { createStripeClient } from "@/lib/stripe";
import { anonymousPrecheckContextCookieName } from "../../../../../../shared/intake/anonymous-precheck-context";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ code: "invalid_content_type" }, 415);
  }
  const intent = request.headers.get("x-apoth-auth-intent") ??
    request.headers.get("x-apoth-checkout-intent");
  if (intent !== "start-email-otp" && intent !== "start-precheck-email-otp") {
    return noStoreJson({ code: "invalid_request_intent" }, 403);
  }
  if (process.env.APOTH_ENROLLMENT_BINDING_ENABLED !== "true") {
    return noStoreJson({ error: "verification_unavailable" }, 503);
  }

  if (intent === "start-precheck-email-otp") {
    return startPrecheckOtp(request);
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

async function startPrecheckOtp(request: NextRequest) {
  const auth = resolveCognitoAuthConfig(process.env);
  const signingSecret = await resolveAppSigningSecret(process.env);
  const body = await readJsonObject(request);
  const email = body && typeof body.email === "string" ? body.email : "";
  if (!auth.ok || !signingSecret.ok) {
    return noStoreJson({ error: "verification_unavailable" }, 503);
  }
  const result = await startPrecheckEmailOtp({
    cognito: createDefaultCognitoEmailOtpAdapter({
      region: auth.value.region,
      userPoolClientId: auth.value.userPoolClientId,
      userPoolId: auth.value.userPoolId,
    }),
    email,
    precheckContext: request.cookies.get(anonymousPrecheckContextCookieName)?.value,
    signingSecret: signingSecret.value,
  });
  if (!result.ok) {
    return noStoreJson(
      { error: result.code },
      result.code === "invalid_email" ? 400 :
        result.code === "precheck_required" ? 403 : 503,
    );
  }
  return noStoreJson({
    status: result.status,
    transactionHandle: result.transactionHandle,
  }, 200, {
    "Set-Cookie": otpChallengeCookieHeader(result.challengeCookie),
  });
}
