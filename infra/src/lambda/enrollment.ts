import {
  authSessionSetCookieHeader,
  parseCookieHeader,
} from "../../../shared/auth/session-cookie.js";
import {
  getServerSession,
  resolveCognitoAuthConfig,
} from "../../../src/lib/auth.js";
import {
  enrollmentAttemptCookieHeader,
  enrollmentAttemptCookieName,
} from "../../../src/lib/enrollment/attempt-cookie.js";
import { resolveEnrollmentCheckoutRuntimeConfig } from "../../../src/lib/enrollment/catalog.js";
import {
  completeEnrollmentCheckoutReturn,
  readEnrollmentCheckoutStatus,
} from "../../../src/lib/enrollment/checkout-completion.js";
import { resolveEnrollmentCheckoutSecrets } from "../../../src/lib/enrollment/checkout-runtime.js";
import { createDefaultCognitoEmailOtpAdapter } from "../../../src/lib/enrollment/cognito-otp.js";
import { beginEnrollmentCheckout } from "../../../src/lib/enrollment/checkout-service.js";
import {
  clearedOtpChallengeCookieHeader,
  otpChallengeCookieHeader,
  otpChallengeCookieName,
} from "../../../src/lib/enrollment/otp-challenge-cookie.js";
import { confirmEnrollmentEmailOtp } from "../../../src/lib/enrollment/otp-confirmation.js";
import { startEnrollmentEmailOtp } from "../../../src/lib/enrollment/otp-service.js";
import { resolvePortalRuntimeConfig } from "../../../src/lib/enrollment/portal-runtime.js";
import { launchPatientPortal } from "../../../src/lib/enrollment/portal-service.js";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "../../../src/lib/enrollment/dynamodb-repository.js";
import { createStripeClient } from "../../../src/lib/stripe.js";
import {
  header,
  isSameOriginMutation,
  json,
  parseJsonBody,
  readPatientSession,
  requestBaseOrigin,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function portalLaunchHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  if (!isSameOriginMutation(event)) {
    return secureJson(403, { error: "invalid_origin" });
  }
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(
    header(event, "content-type") ?? "",
  )) {
    return secureJson(415, { error: "invalid_content_type" });
  }
  const form = new URLSearchParams(event.body ?? "");
  if (form.get("intent") !== "launch") {
    return secureJson(403, { error: "invalid_request_intent" });
  }
  const session = await readPatientSession(event);
  if (!session.ok) {
    return secureJson(session.status, { error: session.code });
  }
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const runtime = resolvePortalRuntimeConfig(process.env);
  if (!database.ok || !runtime.ok) {
    return secureJson(503, { error: "portal_unavailable" });
  }
  const result = await launchPatientPortal({
    cognitoSub: session.session.cognitoSub,
    launchEnabled: runtime.value.launchEnabled,
    provisioningEnabled: runtime.value.provisioningEnabled,
    provider: runtime.value.provider,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    returnOrigin: runtime.value.returnOrigin,
  });
  if (!result.ok) {
    return secureJson(
      result.code === "portal_not_authorized" ? 403 :
        result.code === "portal_busy" ? 409 : 503,
      { error: result.code },
    );
  }
  return {
    body: "",
    headers: {
      "cache-control": "no-store, private",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      location: result.launchUrl,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
    statusCode: 303,
  };
}

export async function checkoutHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  if (!isSameOriginMutation(event)) {
    return json(403, { code: "invalid_origin" });
  }
  if (!/^application\/json(?:;|$)/i.test(header(event, "content-type") ?? "")) {
    return json(415, { code: "invalid_content_type" });
  }
  if (header(event, "x-apoth-checkout-intent") !== "create") {
    return json(403, { code: "invalid_request_intent" });
  }
  const body = parseJsonBody(event.body);
  const catalogCode = body.ok && typeof body.value.catalogCode === "string"
    ? body.value.catalogCode
    : "";
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(catalogCode)) {
    return json(400, { code: "invalid_catalog" });
  }

  const dependencies = await checkoutDependencies();
  if (!dependencies.ok || !dependencies.runtime.enabled) {
    return json(503, { error: "checkout_unavailable" });
  }
  const result = await beginEnrollmentCheckout({
    ...dependencies.runtime,
    // Creation is gated above; return/status remain available during rollback.
    publicCatalogCode: catalogCode,
    repository: dependencies.repository,
    signingSecret: dependencies.secrets.appSigning,
    stripe: dependencies.stripe,
  });
  if (!result.ok) {
    const clientError = result.code === "catalog_unavailable";
    return json(
      clientError ? 404 : 503,
      { error: clientError ? result.code : "checkout_unavailable" },
    );
  }
  return json(200, {
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  }, {
    cookies: [enrollmentAttemptCookieHeader(result.attemptCookie)],
  });
}

export async function checkoutReturnHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const dependencies = await checkoutDependencies();
  const sessionId = new URLSearchParams(event.rawQueryString ?? "").get("session_id") ?? "";
  if (dependencies.ok) {
    await completeEnrollmentCheckoutReturn({
      attemptCookie: requestCookies(event).get(enrollmentAttemptCookieName),
      repository: dependencies.repository,
      sessionId,
      signingSecret: dependencies.secrets.appSigning,
      stripe: dependencies.stripe,
    });
  }

  const origin = dependencies.ok
    ? dependencies.runtime.successOrigin
    : requestBaseOrigin(event);
  return {
    body: "",
    headers: {
      "cache-control": "no-store, private",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      location: `${origin ?? "https://invalid.local"}/checkout/complete`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
    statusCode: 303,
  };
}

export async function statusHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!database.ok || !secrets.ok) {
    return secureJson(503, { error: "status_unavailable" });
  }
  const result = await readEnrollmentCheckoutStatus({
    attemptCookie: requestCookies(event).get(enrollmentAttemptCookieName),
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    signingSecret: secrets.value.appSigning,
  });
  if (!result.ok) {
    return result.code === "invalid_attempt"
      ? secureJson(200, { status: "restart_required" })
      : secureJson(503, { error: "status_unavailable" });
  }
  return secureJson(200, { status: result.status });
}

export async function emailOtpStartHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const mutation = validateJsonIntent(event, "start-email-otp");
  if (!mutation.ok) {
    return json(mutation.status, { code: mutation.code });
  }
  if (process.env.APOTH_ENROLLMENT_BINDING_ENABLED !== "true") {
    return json(503, { error: "verification_unavailable" });
  }

  const dependencies = await identityDependencies();
  if (!dependencies.ok || !dependencies.secrets.identityFingerprint) {
    return json(503, { error: "verification_unavailable" });
  }
  const result = await startEnrollmentEmailOtp({
    attemptCookie: requestCookies(event).get(enrollmentAttemptCookieName),
    cognito: dependencies.cognito,
    identitySecret: dependencies.secrets.identityFingerprint,
    repository: dependencies.repository,
    signingSecret: dependencies.secrets.appSigning,
    stripe: dependencies.stripe,
  });
  if (!result.ok) {
    return json(
      result.code === "verification_not_ready" ? 409 : 503,
      { error: result.code },
    );
  }
  return json(200, {
    status: result.status,
    transactionHandle: result.transactionHandle,
  }, {
    cookies: [otpChallengeCookieHeader(result.challengeCookie)],
  });
}

export async function emailOtpConfirmHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const mutation = validateJsonIntent(event, "confirm-email-otp");
  if (!mutation.ok) {
    return json(mutation.status, { code: mutation.code });
  }
  if (process.env.APOTH_ENROLLMENT_BINDING_ENABLED !== "true") {
    return json(503, { error: "verification_unavailable" });
  }
  const body = parseJsonBody(event.body);
  const code = body.ok && typeof body.value.code === "string" ? body.value.code : "";
  const transactionHandle = body.ok && typeof body.value.transactionHandle === "string"
    ? body.value.transactionHandle
    : "";
  if (!/^\d{6}$/.test(code) || transactionHandle.length < 16) {
    return json(400, { error: "invalid_verification" });
  }

  const dependencies = await identityDependencies();
  if (!dependencies.ok) {
    return json(503, { error: "verification_unavailable" });
  }
  const cookies = requestCookies(event);
  const result = await confirmEnrollmentEmailOtp({
    attemptCookie: cookies.get(enrollmentAttemptCookieName),
    challengeCookie: cookies.get(otpChallengeCookieName),
    code,
    cognito: dependencies.cognito,
    repository: dependencies.repository,
    signingSecret: dependencies.secrets.appSigning,
    transactionHandle,
    verifyAccessToken: async (token) => {
      const session = await getServerSession({
        config: dependencies.auth,
        token,
      });
      return session.ok
        ? { ok: true as const, cognitoSub: session.value.user.cognitoSub }
        : { ok: false as const };
    },
  });
  if (!result.ok) {
    return json(
      result.code === "invalid_verification" ? 400 :
        result.code === "verification_rate_limited" ? 429 : 503,
      { error: result.code },
    );
  }
  return json(200, {
    status: result.status,
    redirect: "/portal/launch",
  }, {
    cookies: [
      authSessionSetCookieHeader({
        maxAge: result.expiresIn,
        value: result.accessToken,
      }),
      clearedOtpChallengeCookieHeader(),
    ],
  });
}

async function checkoutDependencies() {
  const runtime = resolveEnrollmentCheckoutRuntimeConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!runtime.ok || !database.ok || !secrets.ok) {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    runtime: runtime.value,
    secrets: secrets.value,
    stripe: createStripeClient(secrets.value.stripeApi),
  };
}

async function identityDependencies() {
  const auth = resolveCognitoAuthConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!auth.ok || !database.ok || !secrets.ok) {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    auth: auth.value,
    cognito: createDefaultCognitoEmailOtpAdapter({
      region: auth.value.region,
      userPoolClientId: auth.value.userPoolClientId,
      userPoolId: auth.value.userPoolId,
    }),
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    secrets: secrets.value,
    stripe: createStripeClient(secrets.value.stripeApi),
  };
}

function validateJsonIntent(event: ApiGatewayEvent, expectedIntent: string):
  | { ok: true }
  | { ok: false; code: string; status: number } {
  if (!isSameOriginMutation(event)) {
    return { ok: false, code: "invalid_origin", status: 403 };
  }
  if (!/^application\/json(?:;|$)/i.test(header(event, "content-type") ?? "")) {
    return { ok: false, code: "invalid_content_type", status: 415 };
  }
  if (header(event, "x-apoth-checkout-intent") !== expectedIntent) {
    return { ok: false, code: "invalid_request_intent", status: 403 };
  }
  return { ok: true };
}

function requestCookies(event: ApiGatewayEvent) {
  return parseCookieHeader([
    header(event, "cookie"),
    ...(event.cookies ?? []),
  ].filter((value): value is string => Boolean(value)).join("; "));
}

function secureJson(statusCode: number, body: Record<string, unknown>) {
  return json(statusCode, body, {
    headers: {
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
