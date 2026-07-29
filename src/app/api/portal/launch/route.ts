import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginMutation, noStoreJson } from "@/app/api/_shared/onboarding";
import { getServerSession, resolveCognitoAuthConfig } from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";
import { resolvePortalRuntimeConfig } from "@/lib/enrollment/portal-runtime";
import { launchPatientPortal } from "@/lib/enrollment/portal-service";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(
    request.headers.get("content-type") ?? "",
  )) {
    return noStoreJson({ error: "invalid_content_type" }, 415);
  }
  const form = await request.formData();
  if (form.get("intent") !== "launch") {
    return noStoreJson({ error: "invalid_request_intent" }, 403);
  }

  const auth = resolveCognitoAuthConfig(process.env);
  const database = resolveDynamoDbEnrollmentConfig(process.env);
  const runtime = resolvePortalRuntimeConfig(process.env);
  if (!auth.ok || !database.ok || !runtime.ok) {
    return noStoreJson({ error: "portal_unavailable" }, 503);
  }
  const session = await getServerSession({
    config: auth.value,
    token: request.cookies.get(patientAccessCookieName)?.value,
  });
  if (!session.ok) {
    return noStoreJson({ error: "authentication_required" }, 401);
  }

  const result = await launchPatientPortal({
    cognitoSub: session.value.user.cognitoSub,
    launchEnabled: runtime.value.launchEnabled,
    provisioningEnabled: runtime.value.provisioningEnabled,
    provider: runtime.value.provider,
    repository: createDefaultDynamoDbEnrollmentRepository(database.value),
    returnOrigin: runtime.value.returnOrigin,
  });
  if (!result.ok) {
    return noStoreJson(
      { error: result.code },
      result.code === "portal_not_authorized" ? 403 :
        result.code === "portal_busy" ? 409 : 503,
    );
  }

  const response = NextResponse.redirect(result.launchUrl, { status: 303 });
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
