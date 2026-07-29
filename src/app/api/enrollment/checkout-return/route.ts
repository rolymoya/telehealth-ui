import { NextResponse, type NextRequest } from "next/server";
import { enrollmentAttemptCookieName } from "@/lib/enrollment/attempt-cookie";
import { resolveEnrollmentCheckoutRuntimeConfig } from "@/lib/enrollment/catalog";
import { completeEnrollmentCheckoutReturn } from "@/lib/enrollment/checkout-completion";
import { resolveEnrollmentCheckoutSecrets } from "@/lib/enrollment/checkout-runtime";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";
import { createStripeClient } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const runtime = resolveEnrollmentCheckoutRuntimeConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const secrets = await resolveEnrollmentCheckoutSecrets(process.env);
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";

  if (runtime.ok && database.ok && secrets.ok) {
    await completeEnrollmentCheckoutReturn({
      attemptCookie: request.cookies.get(enrollmentAttemptCookieName)?.value,
      repository: createDefaultDynamoDbEnrollmentRepository(database.value),
      sessionId,
      signingSecret: secrets.value.appSigning,
      stripe: createStripeClient(secrets.value.stripeApi),
    });
  }

  const cleanOrigin = runtime.ok
    ? runtime.value.successOrigin
    : request.nextUrl.origin;
  const response = NextResponse.redirect(
    new URL("/checkout/complete", cleanOrigin),
    303,
  );
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
