import type { NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
} from "@/app/api/_shared/onboarding";
import {
  enrollmentReturnUrls,
  resolveCheckoutIntegrationIdentifier,
  resolveCheckoutUiMode,
  resolveEnrollmentRepository,
  resolveEnrollmentStage,
  resolveEnrollmentStripeSecret,
} from "@/app/api/enrollment/_shared";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";
import { initializeEnrollmentCheckout } from "@/lib/enrollment/checkout-service";
import { isPublicProductCode } from "@/lib/public-commerce";
import { createStripeClient } from "@/lib/stripe";
import {
  createPendingEnrollmentCookie,
  enrollmentIdForInitialization,
  pendingEnrollmentCookieName,
  pendingEnrollmentSetCookieHeader,
  verifyPendingEnrollmentCookie,
} from "../../../../../shared/enrollment/pending-enrollment-cookie";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ error: "invalid_content_type" }, 415);
  }

  const body = await readJsonObject(request);
  if (!isPublicProductCode(body?.product)) {
    return noStoreJson({ error: "invalid_product" }, 400);
  }

  const [signing, stripeSecret] = await Promise.all([
    resolveAppSigningSecret(process.env),
    resolveEnrollmentStripeSecret(process.env),
  ]);
  const repository = resolveEnrollmentRepository(process.env);
  const uiMode = resolveCheckoutUiMode(process.env);
  const integrationIdentifier = resolveCheckoutIntegrationIdentifier(process.env);
  const urls = enrollmentReturnUrls(process.env, request);
  if (
    !signing.ok ||
    !stripeSecret.ok ||
    !repository.ok ||
    !uiMode ||
    !integrationIdentifier ||
    !urls
  ) {
    return noStoreJson({ error: "checkout_unavailable" }, 503);
  }

  const existingCookie = verifyPendingEnrollmentCookie({
    secret: signing.value,
    value: request.cookies.get(pendingEnrollmentCookieName)?.value,
  });
  let enrollmentId = existingCookie.ok
    ? existingCookie.payload.enrollmentId
    : null;
  let setCookie: string | null = null;
  if (!enrollmentId) {
    const initializationKey =
      request.headers.get("x-apoth-checkout-initialization") ?? "";
    enrollmentId = enrollmentIdForInitialization({
      initializationKey,
      secret: signing.value,
    });
    if (!enrollmentId) {
      return noStoreJson({ error: "checkout_initialization_invalid" }, 400);
    }
    const cookie = createPendingEnrollmentCookie({
      enrollmentId,
      secret: signing.value,
    });
    if (!cookie) {
      return noStoreJson({ error: "checkout_unavailable" }, 503);
    }
    setCookie = pendingEnrollmentSetCookieHeader(cookie);
  }

  const result = await initializeEnrollmentCheckout({
    enrollmentId,
    integrationIdentifier,
    now: new Date().toISOString(),
    productCode: body.product,
    repository: repository.value,
    stage: resolveEnrollmentStage(process.env),
    stripe: createStripeClient(stripeSecret.value),
    uiMode,
    urls,
  });
  if (!result.ok) {
    return noStoreJson(
      { error: result.code },
      result.code === "invalid_product" ? 400 :
        result.code === "enrollment_expired" ? 409 : 503,
      setCookie ? { "Set-Cookie": setCookie } : {},
    );
  }

  return noStoreJson(
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
    200,
    setCookie ? { "Set-Cookie": setCookie } : {},
  );
}
