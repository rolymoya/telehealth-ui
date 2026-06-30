import { type NextRequest } from "next/server";
import {
  noStoreJson,
  readPatientRouteToken,
  resolveAppDataRepository,
} from "@/app/api/_shared/onboarding";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";
import { resolveCognitoAuthConfig } from "@/lib/auth";
import { resolveOnboardingStartRedirect } from "@/lib/onboarding-start";
import {
  anonymousPrecheckContextCookieName,
  clearedAnonymousPrecheckContextCookieHeader,
  verifyAnonymousPrecheckContext,
  type AnonymousPrecheckContextPayload,
} from "../../../../../shared/intake/anonymous-precheck-context";

export async function GET(request: NextRequest) {
  const token = readPatientRouteToken(request);
  if (!token) {
    return noStoreJson({ error: "authentication_required" }, 401);
  }

  const config = resolveCognitoAuthConfig(process.env);
  const repository = resolveAppDataRepository(process.env);
  if (!config.ok || !repository.ok) {
    return noStoreJson({ error: "onboarding_unavailable" }, 503);
  }

  const anonymousCookie = request.cookies.get(anonymousPrecheckContextCookieName)?.value;
  const anonymousContext = anonymousCookie
    ? await readAnonymousContext(anonymousCookie)
    : { ok: true as const, payload: undefined };
  if (!anonymousContext.ok) {
    return noStoreJson({ error: "onboarding_unavailable" }, 503);
  }

  const result = await resolveOnboardingStartRedirect({
    ...(anonymousContext.payload
      ? { anonymousPrecheckContext: anonymousContext.payload }
      : {}),
    config: config.value,
    pathname: "/get-started",
    repository: repository.value,
    token,
  });
  if (!result.ok) {
    return noStoreJson({ error: "onboarding_unavailable" }, 503);
  }
  if (result.value.destination.startsWith("/sign-in")) {
    return noStoreJson({ error: "authentication_required" }, 401);
  }

  return noStoreJson({
    destination: result.value.destination,
    status: "ready",
  }, 200, anonymousCookie || result.value.clearAnonymousPrecheckContext
    ? { "Set-Cookie": clearedAnonymousPrecheckContextCookieHeader() }
    : {});
}

async function readAnonymousContext(value: string): Promise<
  | { ok: true; payload?: AnonymousPrecheckContextPayload }
  | { ok: false }
> {
  const secret = await resolveAppSigningSecret(process.env);
  if (!secret.ok) {
    return { ok: false };
  }
  const verified = verifyAnonymousPrecheckContext({
    secret: secret.value,
    value,
  });
  return verified.ok
    ? { ok: true, payload: verified.payload }
    : { ok: true };
}
