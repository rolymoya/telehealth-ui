import {
  parseCookieHeader,
} from "../../../shared/auth/session-cookie.js";
import {
  createPendingEnrollmentCookie,
  enrollmentIdForInitialization,
  pendingEnrollmentCookieName,
  pendingEnrollmentSetCookieHeader,
  verifyPendingEnrollmentCookie,
} from "../../../shared/enrollment/pending-enrollment-cookie.js";
import { resolveAppSigningSecret } from "../../../src/lib/app-signing-secret.js";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  bindVerifiedEnrollmentIdentity,
  checkoutConsentVersion,
  createDynamoDbEnrollmentRepository,
  initializeEnrollmentCheckout,
  readEnrollmentStatus,
  recordEnrollmentConsent,
} from "../../../src/lib/enrollment/checkout-service.js";
import {
  enrollmentReturnUrlsForOrigin,
  resolveCheckoutIntegrationIdentifier,
  resolveCheckoutUiMode,
  resolveEnrollmentStage,
} from "../../../src/lib/enrollment/config.js";
import { isPublicProductCode } from "../../../src/lib/public-commerce.js";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "../../../src/lib/secrets/startup.js";
import { createStripeClient } from "../../../src/lib/stripe.js";
import {
  header,
  isAllowedOrigin,
  isSameOriginMutation,
  json,
  localOrConfiguredSiteOrigin,
  parseJsonBody,
  readPatientSession,
  requestOrigin,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function checkoutHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const request = validateJsonMutation(event);
  if (!request.ok) {
    return json(request.status, { error: request.code });
  }
  if (!isPublicProductCode(request.value.product)) {
    return json(400, { error: "invalid_product" });
  }

  const [signing, stripeSecret] = await Promise.all([
    resolveAppSigningSecret(process.env),
    resolveEnrollmentStripeSecret(process.env),
  ]);
  const repository = resolveEnrollmentRepository(process.env);
  const uiMode = resolveCheckoutUiMode(process.env);
  const integrationIdentifier = resolveCheckoutIntegrationIdentifier(process.env);
  const origin = enrollmentOrigin(event);
  if (
    !signing.ok ||
    !stripeSecret.ok ||
    !repository.ok ||
    !uiMode ||
    !integrationIdentifier ||
    !origin
  ) {
    return json(503, { error: "checkout_unavailable" });
  }

  const existingCookie = verifyPendingEnrollmentCookie({
    secret: signing.value,
    value: pendingEnrollmentCookie(event),
  });
  let enrollmentId = existingCookie.ok
    ? existingCookie.payload.enrollmentId
    : null;
  let setCookie: string | null = null;
  if (!enrollmentId) {
    enrollmentId = enrollmentIdForInitialization({
      initializationKey: header(event, "x-apoth-checkout-initialization") ?? "",
      secret: signing.value,
    });
    if (!enrollmentId) {
      return json(400, { error: "checkout_initialization_invalid" });
    }
    const cookie = createPendingEnrollmentCookie({
      enrollmentId,
      secret: signing.value,
    });
    if (!cookie) {
      return json(503, { error: "checkout_unavailable" });
    }
    setCookie = pendingEnrollmentSetCookieHeader(cookie);
  }

  const result = await initializeEnrollmentCheckout({
    enrollmentId,
    integrationIdentifier,
    now: new Date().toISOString(),
    productCode: request.value.product,
    repository: repository.value,
    stage: resolveEnrollmentStage(process.env),
    stripe: createStripeClient(stripeSecret.value),
    uiMode,
    urls: enrollmentReturnUrlsForOrigin(origin),
  });
  const responseOptions = setCookie ? { cookies: [setCookie] } : undefined;
  if (!result.ok) {
    return json(
      result.code === "invalid_product" ? 400 :
        result.code === "enrollment_expired" ? 409 : 503,
      { error: result.code },
      responseOptions,
    );
  }
  return json(
    200,
    result.status === "checkout_session_created"
      ? result.uiMode === "custom"
        ? {
            clientSecret: result.clientSecret,
            status: result.status,
            uiMode: result.uiMode,
          }
        : {
            checkoutUrl: result.checkoutUrl,
            status: result.status,
            uiMode: result.uiMode,
          }
      : { status: result.status },
    responseOptions,
  );
}

export async function consentHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const request = validateJsonMutation(event);
  if (!request.ok) {
    return json(request.status, { error: request.code });
  }
  const context = await resolveEnrollmentContext(event);
  if (!context.ok) {
    return json(401, { error: "enrollment_required" });
  }
  if (request.value.consentVersion !== checkoutConsentVersion) {
    return json(409, { error: "consent_version_invalid" });
  }
  const result = await recordEnrollmentConsent({
    consentVersion: request.value.consentVersion,
    enrollmentId: context.enrollmentId,
    now: new Date().toISOString(),
    repository: context.repository,
  });
  return result.ok
    ? json(200, {
        acceptedAt: result.acceptedAt,
        consentVersion: result.consentVersion,
        status: "consent_recorded",
      })
    : json(result.code === "enrollment_expired" ? 409 : 503, {
        error: result.code,
      });
}

export async function statusHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const context = await resolveEnrollmentContext(event);
  if (!context.ok) {
    return json(401, { error: "enrollment_required" });
  }
  const result = await readEnrollmentStatus({
    enrollmentId: context.enrollmentId,
    now: new Date().toISOString(),
    repository: context.repository,
  });
  return result.ok
    ? json(200, {
        identityBound: result.identityBound,
        paymentSetupComplete: result.paymentSetupComplete,
        status: result.status,
      })
    : json(result.code === "enrollment_expired" ? 409 : 503, {
        error: result.code,
      });
}

export async function bindHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const request = validateJsonMutation(event);
  if (!request.ok) {
    return json(request.status, { error: request.code });
  }
  const [context, session] = await Promise.all([
    resolveEnrollmentContext(event),
    readPatientSession(event),
  ]);
  if (!context.ok) {
    return json(401, { error: "enrollment_required" });
  }
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }
  const result = await bindVerifiedEnrollmentIdentity({
    cognitoSub: session.session.cognitoSub,
    enrollmentId: context.enrollmentId,
    now: new Date().toISOString(),
    repository: context.repository,
  });
  return result.ok
    ? json(200, { redirect: result.redirect, status: result.status })
    : json(
        result.code === "payment_setup_pending" ? 409 :
          result.code === "enrollment_already_bound" ? 403 :
            result.code === "enrollment_expired" ? 409 : 503,
        { error: result.code },
      );
}

function validateJsonMutation(event: ApiGatewayEvent):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: string; status: number } {
  if (!isSameOriginMutation(event)) {
    return { ok: false, code: "invalid_origin", status: 403 };
  }
  if (!header(event, "content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, code: "invalid_content_type", status: 415 };
  }
  const body = parseJsonBody(event.body);
  return body.ok
    ? body
    : { ok: false, code: "invalid_request", status: 400 };
}

async function resolveEnrollmentContext(event: ApiGatewayEvent) {
  const [signing, repository] = await Promise.all([
    resolveAppSigningSecret(process.env),
    Promise.resolve(resolveEnrollmentRepository(process.env)),
  ]);
  if (!signing.ok || !repository.ok) {
    return { ok: false as const };
  }
  const cookie = verifyPendingEnrollmentCookie({
    secret: signing.value,
    value: pendingEnrollmentCookie(event),
  });
  return cookie.ok
    ? {
        ok: true as const,
        enrollmentId: cookie.payload.enrollmentId,
        repository: repository.value,
      }
    : { ok: false as const };
}

function resolveEnrollmentRepository(
  env: Record<string, string | undefined>,
) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? {
        ok: true as const,
        value: createDynamoDbEnrollmentRepository(
          createDynamoDbAppDataRepository(config.value),
        ),
      }
    : { ok: false as const };
}

async function resolveEnrollmentStripeSecret(
  env: Record<string, string | undefined>,
) {
  const source = resolveStartupSecretSource({
    env,
    requiredSecrets: ["stripeApi"],
  });
  if (!source.ok) {
    return { ok: false as const };
  }
  const validated = await validateServerStartupSecrets({
    stage: resolveRuntimeStage(env),
    requiredSecrets: ["stripeApi"],
    source: source.value.source,
  });
  if (!validated.ok) {
    return { ok: false as const };
  }
  const secret = validated.value.find((value) => value.secretKind === "stripeApi");
  return secret?.secretKind === "stripeApi"
    ? { ok: true as const, value: secret }
    : { ok: false as const };
}

function pendingEnrollmentCookie(event: ApiGatewayEvent) {
  const values = [
    header(event, "cookie"),
    ...(event.cookies ?? []),
  ].filter((value): value is string => Boolean(value));
  return parseCookieHeader(values.join("; ")).get(pendingEnrollmentCookieName);
}

export function enrollmentOrigin(event: ApiGatewayEvent) {
  const configuredOrLocal = localOrConfiguredSiteOrigin(event);
  if (configuredOrLocal) {
    return configuredOrLocal;
  }
  const origin = requestOrigin(event);
  return origin && isAllowedOrigin(event) ? origin : null;
}
