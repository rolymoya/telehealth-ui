import "server-only";

import type { NextRequest } from "next/server";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  createDynamoDbEnrollmentRepository,
} from "@/lib/enrollment/checkout-service";
import {
  enrollmentReturnUrlsForOrigin,
  resolveCheckoutIntegrationIdentifier,
  resolveCheckoutUiMode,
  resolveEnrollmentStage,
} from "@/lib/enrollment/config";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "@/lib/secrets/startup";
import {
  pendingEnrollmentCookieName,
  verifyPendingEnrollmentCookie,
} from "../../../../shared/enrollment/pending-enrollment-cookie";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";

export async function resolveEnrollmentRequestContext(
  request: NextRequest,
) {
  const [signing, repository] = await Promise.all([
    resolveAppSigningSecret(process.env),
    Promise.resolve(resolveEnrollmentRepository(process.env)),
  ]);
  if (!signing.ok || !repository.ok) {
    return { ok: false as const };
  }
  const cookie = verifyPendingEnrollmentCookie({
    secret: signing.value,
    value: request.cookies.get(pendingEnrollmentCookieName)?.value,
  });
  if (!cookie.ok) {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    enrollmentId: cookie.payload.enrollmentId,
    repository: repository.value,
    signingSecret: signing.value,
  };
}

export function resolveEnrollmentRepository(
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

export async function resolveEnrollmentStripeSecret(
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
  return secret
    ? { ok: true as const, value: secret }
    : { ok: false as const };
}

export {
  resolveCheckoutIntegrationIdentifier,
  resolveCheckoutUiMode,
  resolveEnrollmentStage,
};

export function enrollmentReturnUrls(
  env: Record<string, string | undefined>,
  request: NextRequest,
) {
  const origin = configuredOrLocalOrigin(env.NEXT_PUBLIC_SITE_URL, request);
  if (!origin) {
    return null;
  }
  return enrollmentReturnUrlsForOrigin(origin);
}

function configuredOrLocalOrigin(
  configured: string | undefined,
  request: NextRequest,
) {
  const configuredOrigin = canonicalOrigin(configured);
  if (configuredOrigin) {
    return configuredOrigin;
  }
  const requestOrigin = canonicalOrigin(request.nextUrl.origin);
  if (!requestOrigin) {
    return null;
  }
  const hostname = new URL(requestOrigin).hostname;
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
    ? requestOrigin
    : null;
}

function canonicalOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
