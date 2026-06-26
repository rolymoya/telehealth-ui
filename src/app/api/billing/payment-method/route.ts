import { NextResponse, type NextRequest } from "next/server";
import {
  getServerSession,
  resolveCognitoAuthConfig,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  createDynamoDbPaymentMethodCollectionRepository,
  preparePaymentMethodCollection,
  type PaymentMethodStage,
} from "@/lib/billing-payment-method";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import { resolveRuntimeStage, resolveStartupSecretSource, validateServerStartupSecrets } from "@/lib/secrets/startup";
import { createStripeClient } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const session = await readBillingSession(request);
  if (!session.ok) {
    return noStoreJson({ error: session.error }, session.status);
  }

  const repository = resolveBillingRepository(process.env);
  const secret = await resolveStripeSecret(process.env);
  const returnUrls = billingReturnUrls(process.env, request);
  if (!repository.ok || !secret.ok || !returnUrls) {
    return noStoreJson({ error: "billing_unavailable" }, 503);
  }

  const result = await preparePaymentMethodCollection({
    cognitoSub: session.value.user.cognitoSub,
    now: new Date().toISOString(),
    repository: createDynamoDbPaymentMethodCollectionRepository(repository.value),
    stage: resolvePaymentMethodStage(process.env),
    stripe: createStripeClient(secret.value),
    urls: returnUrls,
  });
  if (!result.ok) {
    const retryable = retryableBillingError(result.code);
    return noStoreJson(
      { error: retryable ? "billing_unavailable" : result.code },
      retryable ? 503 : 409,
    );
  }

  if (result.status === "payment_method_already_collected") {
    return noStoreJson({
      billingStatus: result.billingStatus,
      status: result.status,
    });
  }

  return noStoreJson({
    billingStatus: result.billingStatus,
    checkoutSessionId: result.checkoutSessionId,
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  });
}

async function readBillingSession(request: NextRequest) {
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

function resolveBillingRepository(env: Record<string, string | undefined>) {
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

function resolvePaymentMethodStage(env: Record<string, string | undefined>): PaymentMethodStage {
  return env.APOTH_STAGE === "production" ? "production" : "staging";
}

function retryableBillingError(code: string) {
  return code === "storage_unavailable" ||
    code === "stripe_unavailable" ||
    code === "invalid_stripe_metadata";
}

function billingReturnUrls(env: Record<string, string | undefined>, request: NextRequest) {
  const origin = resolveBillingReturnOrigin(env, request);
  if (!origin) {
    return null;
  }
  return {
    cancelUrl: `${origin}/billing`,
    successUrl: `${origin}/dashboard`,
  };
}

function resolveBillingReturnOrigin(
  env: Record<string, string | undefined>,
  request: NextRequest,
) {
  const configured = canonicalOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (configured) {
    return configured;
  }

  const requestOrigin = canonicalOrigin(request.nextUrl.origin);
  if (requestOrigin && isLocalDevelopmentOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return null;
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

function isLocalDevelopmentOrigin(origin: string) {
  const url = new URL(origin);
  return url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, private",
    },
    status,
  });
}
