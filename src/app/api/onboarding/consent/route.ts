import { type NextRequest } from "next/server";
import {
  isRecord,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
  readPatientRouteToken,
  resolveAppDataRepository,
} from "@/app/api/_shared/onboarding";
import { resolveCognitoAuthConfig } from "@/lib/auth";
import { acceptCurrentConsents } from "@/lib/consent-acceptance";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return noStoreJson({ error: "invalid_content_type" }, 415);
  }

  const token = readPatientRouteToken(request);
  if (!token) {
    return noStoreJson({ error: "authentication_required" }, 401);
  }

  const config = resolveCognitoAuthConfig(process.env);
  const repository = resolveAppDataRepository(process.env);
  if (!config.ok || !repository.ok) {
    return noStoreJson({ error: "onboarding_unavailable" }, 503);
  }

  const body = await readJsonObject(request);
  const acknowledgements = consentAcknowledgements(body?.acknowledgements);
  const result = await acceptCurrentConsents({
    acknowledgements,
    config: config.value,
    repository: repository.value,
    token,
  });
  if (!result.ok) {
    return noStoreJson({
      error: result.error.kind === "validation_failed"
        ? "invalid_consent"
        : "onboarding_unavailable",
    }, result.error.kind === "validation_failed" ? 400 : 503);
  }
  if (result.value.destination.startsWith("/sign-in")) {
    return noStoreJson({ error: "authentication_required" }, 401);
  }

  return noStoreJson({
    destination: result.value.destination,
    status: "accepted",
  });
}

function consentAcknowledgements(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" || typeof entry === "boolean"
        ? [[key, entry]]
        : []
    ),
  );
}
