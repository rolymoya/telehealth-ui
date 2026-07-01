import {
  cancelPatientSubscriptionAtPeriodEnd,
  createDynamoDbBillingActivationRepository,
  createUnsupportedMdiCancellationAction,
  type BillingActivationStage,
} from "../../../src/lib/billing-activation.js";
import {
  createDynamoDbPaymentMethodCollectionRepository,
  preparePaymentMethodCollection,
  type PaymentMethodStage,
} from "../../../src/lib/billing-payment-method.js";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "../../../src/lib/secrets/startup.js";
import { createStripeClient } from "../../../src/lib/stripe.js";
import {
  isSameOriginMutation,
  json,
  localOrConfiguredSiteOrigin,
  readPatientSession,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function paymentMethodHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const repository = resolveRepository(process.env);
  const secret = await resolveStripeSecret(process.env);
  const returnUrls = billingReturnUrls(event);
  if (!repository.ok || !secret.ok || !returnUrls) {
    return json(503, { error: "billing_unavailable" });
  }

  const result = await preparePaymentMethodCollection({
    cognitoSub: session.session.cognitoSub,
    now: new Date().toISOString(),
    repository: createDynamoDbPaymentMethodCollectionRepository(repository.value),
    stage: resolvePaymentMethodStage(process.env),
    stripe: createStripeClient(secret.value),
    urls: returnUrls,
  });
  if (!result.ok) {
    const retryable = retryableBillingError(result.code);
    return json(
      retryable ? 503 : 409,
      { error: retryable ? "billing_unavailable" : result.code },
    );
  }

  if (result.status === "payment_method_already_collected") {
    return json(200, {
      billingStatus: result.billingStatus,
      status: result.status,
    });
  }

  return json(200, {
    billingStatus: result.billingStatus,
    checkoutSessionId: result.checkoutSessionId,
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  });
}

export async function subscriptionCancelHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  if (!isSameOriginMutation(event)) {
    return json(403, { error: "invalid_origin" });
  }

  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const repository = resolveRepository(process.env);
  const secret = await resolveStripeSecret(process.env);
  if (!repository.ok || !secret.ok) {
    return json(503, { error: "billing_unavailable" });
  }

  const result = await cancelPatientSubscriptionAtPeriodEnd({
    cognitoSub: session.session.cognitoSub,
    mdiCancellationAction: createUnsupportedMdiCancellationAction(),
    now: new Date().toISOString(),
    repository: createDynamoDbBillingActivationRepository(repository.value),
    stage: resolveBillingCancellationStage(process.env),
    stripe: createStripeClient(secret.value),
  });
  if (!result.ok) {
    return json(503, { error: "billing_unavailable" });
  }
  if (result.status === "not_active") {
    return json(409, { error: "subscription_not_active" });
  }

  return json(200, { status: result.status });
}

function resolveRepository(env: Record<string, string | undefined>) {
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

function resolveBillingCancellationStage(env: Record<string, string | undefined>): BillingActivationStage {
  return env.APOTH_STAGE === "production" ? "production" : "staging";
}

function retryableBillingError(code: string) {
  return code === "storage_unavailable" ||
    code === "stripe_unavailable" ||
    code === "invalid_stripe_metadata";
}

function billingReturnUrls(event: ApiGatewayEvent) {
  const origin = localOrConfiguredSiteOrigin(event);
  if (!origin) {
    return null;
  }
  return {
    cancelUrl: `${origin}/billing`,
    successUrl: `${origin}/dashboard`,
  };
}
