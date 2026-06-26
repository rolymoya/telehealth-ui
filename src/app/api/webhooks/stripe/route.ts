import { NextResponse, type NextRequest } from "next/server";
import {
  activateBillingAfterClinicalUnlock,
  createDynamoDbBillingActivationRepository,
} from "@/lib/billing-activation";
import { createDynamoDbAppDataRepository, resolveDynamoDbAppDataConfig } from "@/lib/dynamodb/app-data-dynamodb";
import { resolveRuntimeStage, resolveStartupSecretSource, validateServerStartupSecrets } from "@/lib/secrets/startup";
import { createSqsWebhookEnqueue, resolveWebhookQueueConfig } from "@/lib/sqs";
import { createStripeClient } from "@/lib/stripe";
import {
  createDynamoDbStripeMirrorRepository,
  handleStripeWebhook,
  maxStripeWebhookPayloadBytes,
} from "@/lib/stripe-webhooks";
import { createDynamoDbWebhookProcessingRepository } from "@/lib/webhook-processing-repository";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const payload = await readRequestBodyWithLimit(request, maxStripeWebhookPayloadBytes);
  if (!payload.ok) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const secret = await resolveStripeSecret(process.env);
  const repository = resolveRepository(process.env);
  const queue = resolveWebhookQueueConfig(process.env);
  if (!secret.ok || !repository.ok || !queue.ok) {
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
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
    secret: secret.value,
    signature,
    stripe,
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

function resolveStripeRecurringPriceId(env: Record<string, string | undefined>) {
  const value = env.STRIPE_RECURRING_PRICE_ID;
  return value && /^price_[A-Za-z0-9_]+$/.test(value)
    ? { ok: true as const, value }
    : { ok: false as const };
}

function resolvePaymentStage(env: Record<string, string | undefined>) {
  return env.APOTH_STAGE === "production" ? "production" as const : "staging" as const;
}
