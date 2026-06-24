import { type NextRequest } from "next/server";
import {
  noStoreJson,
  readPatientRouteToken,
  resolveAppDataRepository,
} from "@/app/api/_shared/onboarding";
import { resolveCognitoAuthConfig } from "@/lib/auth";
import { resolveOnboardingStartRedirect } from "@/lib/onboarding-start";

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

  const result = await resolveOnboardingStartRedirect({
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
  });
}
