import {
  activateBillingAfterClinicalUnlock,
  cancelActiveBillingAfterClinicalClosure,
  createDynamoDbBillingActivationRepository,
} from "../../../src/lib/billing-activation.js";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  createDynamoDbMdiWebhookMirrorRepository,
  handleMdiWebhook,
  maxMdiWebhookPayloadBytes,
} from "../../../src/lib/mdi-webhooks.js";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "../../../src/lib/secrets/startup.js";
import type {
  MdiApiSecretPayload,
  StripeApiSecretPayload,
} from "../../../src/lib/secrets/contracts.js";
import { createSqsWebhookEnqueue, resolveWebhookQueueConfig } from "../../../src/lib/sqs.js";
import { createStripeClient } from "../../../src/lib/stripe.js";
import {
  createDynamoDbStripeMirrorRepository,
  handleStripeWebhook,
  maxStripeWebhookPayloadBytes,
} from "../../../src/lib/stripe-webhooks.js";
import { createDynamoDbWebhookProcessingRepository } from "../../../src/lib/webhook-processing-repository.js";
import {
  header,
  json,
  rawBodyBuffer,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function stripeWebhookHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const signature = header(event, "stripe-signature");
  if (!signature) {
    return json(400, { error: "invalid_signature" });
  }

  const payload = rawBodyBuffer(event, maxStripeWebhookPayloadBytes);
  if (!payload.ok) {
    return json(400, { error: "invalid_signature" });
  }

  const secret = await resolveStripeSecret(process.env);
  const repository = resolveRepository(process.env);
  const queue = resolveWebhookQueueConfig(process.env);
  if (!secret.ok || !repository.ok || !queue.ok) {
    return json(500, { error: "webhook_processing_failed" });
  }

  const stripe = createStripeClient(secret.value);
  const result = await handleStripeWebhook({
    billingActivation: {
      async activate(input) {
        const priceId = resolveStripeRecurringPriceId(process.env);
        if (!priceId.ok) {
          return { ok: false as const, retryable: true };
        }
        const activated = await activateBillingAfterClinicalUnlock({
          cognitoSub: input.cognitoSub,
          mdiCaseId: input.mdiCaseId,
          now: input.now,
          priceId: priceId.value,
          repository: createDynamoDbBillingActivationRepository(repository.value),
          stage: resolvePaymentStage(process.env),
          stripe,
        });
        return activated.ok
          ? { ok: true as const }
          : { ok: false as const, retryable: activated.code !== "invalid_stripe_metadata" };
      },
    },
    stripeMirrorRepository: createDynamoDbStripeMirrorRepository(repository.value),
    enqueue: createSqsWebhookEnqueue(queue.value),
    payload: payload.value,
    receivedAt: new Date().toISOString(),
    secret: stripeWebhookSecret(secret.value),
    signature,
    stripe,
    webhookRepository: createDynamoDbWebhookProcessingRepository(repository.value),
  });

  return json(result.status, result.body);
}

export async function mdiWebhookHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const authorization = header(event, "authorization");
  const signature = header(event, "signature");
  if (!authorization || !signature) {
    return json(400, { error: "invalid_signature" });
  }

  const payload = rawBodyBuffer(event, maxMdiWebhookPayloadBytes);
  if (!payload.ok) {
    return json(400, { error: "invalid_signature" });
  }

  const secret = await resolveMdiSecret(process.env);
  const repository = resolveRepository(process.env);
  if (!secret.ok || !repository.ok) {
    return json(500, { error: "webhook_processing_failed" });
  }

  const result = await handleMdiWebhook({
    authorization,
    billingActivation: {
      async activate(input) {
        const dependencies = await resolveBillingActivationDependencies(process.env);
        if (!dependencies.ok) {
          return { ok: false as const, retryable: true };
        }
        const activated = await activateBillingAfterClinicalUnlock({
          cognitoSub: input.cognitoSub,
          mdiCaseId: input.mdiCaseId,
          now: input.now,
          priceId: dependencies.priceId,
          repository: createDynamoDbBillingActivationRepository(repository.value),
          stage: resolvePaymentStage(process.env),
          stripe: dependencies.stripe,
        });
        return activated.ok
          ? { ok: true as const }
          : { ok: false as const, retryable: activated.code !== "invalid_stripe_metadata" };
      },
      async cancel(input) {
        const dependencies = await resolveBillingActivationDependencies(process.env);
        if (!dependencies.ok) {
          return { ok: false as const, retryable: true };
        }
        const canceled = await cancelActiveBillingAfterClinicalClosure({
          cognitoSub: input.cognitoSub,
          mdiCaseId: input.mdiCaseId,
          now: input.now,
          repository: createDynamoDbBillingActivationRepository(repository.value),
          stage: resolvePaymentStage(process.env),
          stripe: dependencies.stripe,
        });
        return canceled.ok
          ? { ok: true as const }
          : { ok: false as const, retryable: true };
      },
    },
    mdiMirrorRepository: createDynamoDbMdiWebhookMirrorRepository(repository.value),
    payload: payload.value,
    receivedAt: new Date().toISOString(),
    secret: mdiWebhookSecret(secret.value),
    signature,
    webhookRepository: createDynamoDbWebhookProcessingRepository(repository.value),
  });

  return json(result.status, result.body);
}

async function resolveMdiSecret(env: Record<string, string | undefined>) {
  const source = resolveStartupSecretSource({
    env,
    requiredSecrets: ["mdiApi"],
  });
  if (!source.ok) {
    return { ok: false as const };
  }
  const validated = await validateServerStartupSecrets({
    stage: resolveRuntimeStage(env),
    requiredSecrets: ["mdiApi"],
    source: source.value.source,
  });
  if (!validated.ok) {
    return { ok: false as const };
  }
  const secret = validated.value.find((value) => value.secretKind === "mdiApi");
  return secret
    ? { ok: true as const, value: secret }
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

function resolveRepository(env: Record<string, string | undefined>) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? { ok: true as const, value: createDynamoDbAppDataRepository(config.value) }
    : { ok: false as const };
}

async function resolveBillingActivationDependencies(env: Record<string, string | undefined>) {
  const stripeSecret = await resolveStripeSecret(env);
  const priceId = resolveStripeRecurringPriceId(env);
  if (!stripeSecret.ok || !priceId.ok) {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    priceId: priceId.value,
    stripe: createStripeClient(stripeSecret.value),
  };
}

function resolveStripeRecurringPriceId(env: Record<string, string | undefined>) {
  const value = env.STRIPE_RECURRING_PRICE_ID;
  return value && /^price_[A-Za-z0-9_]+$/.test(value)
    ? { ok: true as const, value }
    : { ok: false as const };
}

function resolvePaymentStage(env: Record<string, string | undefined>) {
  return env.APOTH_STAGE === "production" ? "production" as const : "staging" as const;
}

function stripeWebhookSecret(secret: StripeApiSecretPayload) {
  return {
    webhookSigningSecret: secret.webhookSigningSecret,
    ...(secret.webhookSigningSecretPrevious
      ? { webhookSigningSecretPrevious: secret.webhookSigningSecretPrevious }
      : {}),
    ...(secret.webhookSigningSecretPreviousExpiresAt
      ? { webhookSigningSecretPreviousExpiresAt: secret.webhookSigningSecretPreviousExpiresAt }
      : {}),
  };
}

function mdiWebhookSecret(secret: MdiApiSecretPayload) {
  return {
    webhookAuthorizationSecret: secret.webhookAuthorizationSecret,
    webhookSigningSecret: secret.webhookSigningSecret,
    ...(secret.webhookSigningSecretPrevious
      ? { webhookSigningSecretPrevious: secret.webhookSigningSecretPrevious }
      : {}),
    ...(secret.webhookSigningSecretPreviousExpiresAt
      ? { webhookSigningSecretPreviousExpiresAt: secret.webhookSigningSecretPreviousExpiresAt }
      : {}),
  };
}
