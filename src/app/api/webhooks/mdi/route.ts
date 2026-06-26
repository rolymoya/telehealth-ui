import { NextResponse, type NextRequest } from "next/server";
import {
  activateBillingAfterClinicalUnlock,
  cancelActiveBillingAfterClinicalClosure,
  createDynamoDbBillingActivationRepository,
} from "@/lib/billing-activation";
import { createDynamoDbAppDataRepository, resolveDynamoDbAppDataConfig } from "@/lib/dynamodb/app-data-dynamodb";
import {
  createDynamoDbMdiWebhookMirrorRepository,
  handleMdiWebhook,
  maxMdiWebhookPayloadBytes,
} from "@/lib/mdi-webhooks";
import { resolveRuntimeStage, resolveStartupSecretSource, validateServerStartupSecrets } from "@/lib/secrets/startup";
import { createStripeClient } from "@/lib/stripe";
import { createDynamoDbWebhookProcessingRepository } from "@/lib/webhook-processing-repository";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const signature = request.headers.get("signature");
  if (!authorization || !signature) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const payload = await readRequestBodyWithLimit(request, maxMdiWebhookPayloadBytes);
  if (!payload.ok) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const secret = await resolveMdiSecret(process.env);
  const repository = resolveRepository(process.env);
  if (!secret.ok || !repository.ok) {
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
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
    secret: secret.value,
    signature,
    webhookRepository: createDynamoDbWebhookProcessingRepository(repository.value),
  });

  return NextResponse.json(result.body, { status: result.status });
}

async function readRequestBodyWithLimit(
  request: NextRequest,
  maxBytes: number,
): Promise<{ ok: true; value: Buffer } | { ok: false }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false };
  }

  if (!request.body) {
    return { ok: true, value: Buffer.alloc(0) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  return { ok: true, value: Buffer.concat(chunks, byteLength) };
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
