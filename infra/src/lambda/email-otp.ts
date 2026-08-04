import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  authSessionSetCookieHeader,
  parseCookieHeader,
} from "../../../shared/auth/session-cookie.js";
import { resolveAppSigningSecret } from "../../../src/lib/app-signing-secret.js";
import { createDefaultCognitoEmailOtpAdapter } from "../../../src/lib/enrollment/cognito-otp.js";
import {
  clearedOtpChallengeCookieHeader,
  otpChallengeCookieHeader,
  otpChallengeCookieName,
} from "../../../src/lib/enrollment/otp-challenge-cookie.js";
import {
  confirmPrecheckEmailOtp,
  startPrecheckEmailOtp,
} from "../../../src/lib/enrollment/precheck-otp.js";
import { anonymousPrecheckContextCookieName } from "../../../shared/intake/anonymous-precheck-context.js";
import {
  header,
  isSameOriginMutation,
  json,
  parseJsonBody,
  requiredEnv,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function startHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const request = validateMutation(event, "start-precheck-email-otp");
  if (!request.ok) {
    return json(request.status, { error: request.code });
  }
  const email = typeof request.value.email === "string" ? request.value.email : "";
  const signing = await resolveAppSigningSecret(process.env);
  if (!signing.ok) {
    return json(503, { error: "verification_unavailable" });
  }
  const result = await startPrecheckEmailOtp({
    cognito: cognitoAdapter(),
    email,
    precheckContext: parseCookieHeader(cookieHeader(event))
      .get(anonymousPrecheckContextCookieName),
    signingSecret: signing.value,
  });
  return result.ok
    ? json(200, {
        status: result.status,
        transactionHandle: result.transactionHandle,
      }, { cookies: [otpChallengeCookieHeader(result.challengeCookie)] })
    : json(result.code === "invalid_email" ? 400 :
        result.code === "precheck_required" ? 403 : 503, {
        error: result.code,
      });
}

export async function confirmHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const request = validateMutation(event, "confirm-precheck-email-otp");
  if (!request.ok) {
    return json(request.status, { error: request.code });
  }
  const code = typeof request.value.code === "string" ? request.value.code : "";
  const transactionHandle = typeof request.value.transactionHandle === "string"
    ? request.value.transactionHandle
    : "";
  if (!/^\d{6}$/.test(code) || transactionHandle.length < 16) {
    return json(400, { error: "invalid_verification" });
  }

  const signing = await resolveAppSigningSecret(process.env);
  if (!signing.ok) {
    return json(503, { error: "verification_unavailable" });
  }
  const result = await confirmPrecheckEmailOtp({
    challengeCookie: parseCookieHeader(cookieHeader(event)).get(otpChallengeCookieName),
    code,
    cognito: cognitoAdapter(),
    signingSecret: signing.value,
    transactionHandle,
    verifyAccessToken: async (token) => {
      try {
        const claims = await verifier().verify(token);
        return typeof claims.sub === "string" && claims.sub
          ? { ok: true as const }
          : { ok: false as const };
      } catch {
        return { ok: false as const };
      }
    },
  });
  if (!result.ok) {
    return json(
      result.code === "invalid_verification" ? 400 :
        result.code === "verification_rate_limited" ? 429 : 503,
      { error: result.code },
    );
  }
  return json(200, { status: result.status }, {
    cookies: [
      authSessionSetCookieHeader({
        maxAge: result.expiresIn,
        value: result.accessToken,
      }),
      clearedOtpChallengeCookieHeader(),
    ],
  });
}

function validateMutation(
  event: ApiGatewayEvent,
  intent: "confirm-precheck-email-otp" | "start-precheck-email-otp",
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: string; status: number } {
  if (!isSameOriginMutation(event)) {
    return { ok: false, code: "invalid_origin", status: 403 };
  }
  if (!/^application\/json(?:;|$)/i.test(header(event, "content-type") ?? "")) {
    return { ok: false, code: "invalid_content_type", status: 415 };
  }
  if (header(event, "x-apoth-auth-intent") !== intent) {
    return { ok: false, code: "invalid_request_intent", status: 403 };
  }
  const body = parseJsonBody(event.body);
  return body.ok
    ? body
    : { ok: false, code: "invalid_request", status: 400 };
}

function cognitoAdapter() {
  return createDefaultCognitoEmailOtpAdapter({
    region: process.env.AWS_REGION ?? requiredEnv("COGNITO_REGION"),
    userPoolClientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
  });
}

function verifier() {
  return CognitoJwtVerifier.create({
    clientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    tokenUse: "access",
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
  });
}

function cookieHeader(event: ApiGatewayEvent) {
  return [header(event, "cookie"), ...(event.cookies ?? [])]
    .filter((value): value is string => Boolean(value))
    .join("; ");
}
