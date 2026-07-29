import { type NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
} from "@/app/api/_shared/onboarding";
import { enrollmentAttemptCookieHeader } from "@/lib/enrollment/attempt-cookie";
import { resolveEnrollmentCheckoutRuntimeConfig } from "@/lib/enrollment/catalog";
import { resolveEnrollmentCheckoutSecrets } from "@/lib/enrollment/checkout-runtime";
import { beginEnrollmentCheckout } from "@/lib/enrollment/checkout-service";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";
import { createStripeClient } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ code: "invalid_content_type" }, 415);
  }
  if (request.headers.get("x-apoth-checkout-intent") !== "create") {
    return noStoreJson({ code: "invalid_request_intent" }, 403);
  }

  const body = await readJsonObject(request);
  const catalogCode = body && typeof body.catalogCode === "string"
    ? body.catalogCode
    : "";
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(catalogCode)) {
    return noStoreJson({ code: "invalid_catalog" }, 400);
  }

  const runtime = resolveEnrollmentCheckoutRuntimeConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  if (!runtime.ok || !runtime.value.enabled || !database.ok || !secrets.ok) {
    return noStoreJson({ error: "checkout_unavailable" }, 503);
  }

  const result = await beginEnrollmentCheckout({
    ...runtime.value,
    publicCatalogCode: catalogCode,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    signingSecret: secrets.value.appSigning,
    stripe: createStripeClient(secrets.value.stripeApi),
  });
  if (!result.ok) {
    const clientError = result.code === "catalog_unavailable";
    return noStoreJson(
      { error: clientError ? result.code : "checkout_unavailable" },
      clientError ? 404 : 503,
    );
  }

  return noStoreJson({
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  }, 200, {
    "Set-Cookie": enrollmentAttemptCookieHeader(result.attemptCookie),
  });
}
