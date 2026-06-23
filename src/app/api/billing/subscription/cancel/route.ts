import { NextResponse, type NextRequest } from "next/server";
import {
  getServerSession,
  resolveCognitoAuthConfig,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  cancelPatientSubscriptionAtPeriodEnd,
  createDynamoDbBillingActivationRepository,
  type BillingActivationStage,
} from "@/lib/billing-activation";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import { resolveRuntimeStage, resolveStartupSecretSource, validateServerStartupSecrets } from "@/lib/secrets/startup";
import { createStripeClient } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const session = await readBillingCancellationSession(request);
  if (!session.ok) {
    return noStoreJson({ error: session.error }, session.status);
  }

  const repository = resolveBillingCancellationRepository(process.env);
  const secret = await resolveStripeSecret(process.env);
  if (!repository.ok || !secret.ok) {
    return noStoreJson({ error: "billing_unavailable" }, 503);
  }

  const result = await cancelPatientSubscriptionAtPeriodEnd({
    cognitoSub: session.value.user.cognitoSub,
    now: new Date().toISOString(),
    repository: createDynamoDbBillingActivationRepository(repository.value),
    stage: resolveBillingCancellationStage(process.env),
    stripe: createStripeClient(secret.value),
  });
  if (!result.ok) {
    return noStoreJson({ error: "billing_unavailable" }, 503);
  }
  if (result.status === "not_active") {
    return noStoreJson({ error: "subscription_not_active" }, 409);
  }

  return noStoreJson({
    status: result.status,
  });
}

async function readBillingCancellationSession(request: NextRequest) {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    return { ok: false as const, error: "billing_unavailable", status: 503 };
  }

  const token = request.cookies.get(patientAccessCookieName)?.value ?? null;
  const session = await getServerSession({
    config: config.value,
    token,
  });
  if (!session.ok) {
    return { ok: false as const, error: "authentication_required", status: 401 };
  }

  return { ok: true as const, value: session.value };
}

function resolveBillingCancellationRepository(env: Record<string, string | undefined>) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? { ok: true as const, value: createDynamoDbAppDataRepository(config.value) }
    : { ok: false as const };
}

async function resolveStripeSecret(env: Record<string, string | undefined>) {
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

function resolveBillingCancellationStage(env: Record<string, string | undefined>): BillingActivationStage {
  return env.APOTH_STAGE === "production" ? "production" : "staging";
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, private",
    },
    status,
  });
}
