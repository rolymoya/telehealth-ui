import { type NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
} from "@/app/api/_shared/onboarding";
import { resolveCognitoAuthConfig, getServerSession } from "@/lib/auth";
import { enrollmentAttemptCookieName } from "@/lib/enrollment/attempt-cookie";
import { createDefaultCognitoEmailOtpAdapter } from "@/lib/enrollment/cognito-otp";
import { resolveEnrollmentCheckoutSecrets } from "@/lib/enrollment/checkout-runtime";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";
import {
  clearedOtpChallengeCookieHeader,
  otpChallengeCookieName,
} from "@/lib/enrollment/otp-challenge-cookie";
import { confirmEnrollmentEmailOtp } from "@/lib/enrollment/otp-confirmation";
import { authSessionSetCookieHeader } from "../../../../../../shared/auth/session-cookie";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ code: "invalid_content_type" }, 415);
  }
  if (request.headers.get("x-apoth-checkout-intent") !== "confirm-email-otp") {
    return noStoreJson({ code: "invalid_request_intent" }, 403);
  }
  if (process.env.APOTH_ENROLLMENT_BINDING_ENABLED !== "true") {
    return noStoreJson({ error: "verification_unavailable" }, 503);
  }

  const body = await readJsonObject(request);
  const code = body && typeof body.code === "string" ? body.code : "";
  const transactionHandle = body && typeof body.transactionHandle === "string"
    ? body.transactionHandle
    : "";
  if (!/^\d{6}$/.test(code) || transactionHandle.length < 16) {
    return noStoreJson({ error: "invalid_verification" }, 400);
  }

  const auth = resolveCognitoAuthConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!auth.ok || !database.ok || !secrets.ok) {
    return noStoreJson({ error: "verification_unavailable" }, 503);
  }
  const cognito = createDefaultCognitoEmailOtpAdapter({
    region: auth.value.region,
    userPoolClientId: auth.value.userPoolClientId,
    userPoolId: auth.value.userPoolId,
  });
  const result = await confirmEnrollmentEmailOtp({
    attemptCookie: request.cookies.get(enrollmentAttemptCookieName)?.value,
    challengeCookie: request.cookies.get(otpChallengeCookieName)?.value,
    code,
    cognito,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    signingSecret: secrets.value.appSigning,
    transactionHandle,
    verifyAccessToken: async (token) => {
      const session = await getServerSession({
        config: auth.value,
        token,
      });
      return session.ok
        ? { ok: true as const, cognitoSub: session.value.user.cognitoSub }
        : { ok: false as const };
    },
  });
  if (!result.ok) {
    return noStoreJson(
      { error: result.code },
      result.code === "invalid_verification" ? 400 :
        result.code === "verification_rate_limited" ? 429 : 503,
    );
  }

  const response = noStoreJson({
    status: result.status,
    redirect: "/portal/launch",
  });
  response.headers.append("Set-Cookie", authSessionSetCookieHeader({
    maxAge: result.expiresIn,
    value: result.accessToken,
  }));
  response.headers.append("Set-Cookie", clearedOtpChallengeCookieHeader());
  return response;
}
