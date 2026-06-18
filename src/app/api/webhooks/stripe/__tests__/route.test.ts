import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDynamoDbAppDataRepository: vi.fn(() => ({ kind: "dynamodb-repo" })),
  createDynamoDbStripeMirrorRepository: vi.fn(() => ({ kind: "stripe-mirror" })),
  createDynamoDbWebhookProcessingRepository: vi.fn(() => ({ kind: "webhook-repo" })),
  createSqsWebhookEnqueue: vi.fn(() => vi.fn()),
  handleStripeWebhook: vi.fn(),
  resolveDynamoDbAppDataConfig: vi.fn(),
  resolveRuntimeStage: vi.fn(() => "staging"),
  resolveStartupSecretSource: vi.fn(),
  validateServerStartupSecrets: vi.fn(),
  resolveWebhookQueueConfig: vi.fn(),
}));

vi.mock("@/lib/dynamodb/app-data-dynamodb", () => ({
  createDynamoDbAppDataRepository: mocks.createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig: mocks.resolveDynamoDbAppDataConfig,
}));

vi.mock("@/lib/secrets/startup", () => ({
  resolveRuntimeStage: mocks.resolveRuntimeStage,
  resolveStartupSecretSource: mocks.resolveStartupSecretSource,
  validateServerStartupSecrets: mocks.validateServerStartupSecrets,
}));

vi.mock("@/lib/sqs", () => ({
  createSqsWebhookEnqueue: mocks.createSqsWebhookEnqueue,
  resolveWebhookQueueConfig: mocks.resolveWebhookQueueConfig,
}));

vi.mock("@/lib/stripe-webhooks", () => ({
  createDynamoDbStripeMirrorRepository: mocks.createDynamoDbStripeMirrorRepository,
  handleStripeWebhook: mocks.handleStripeWebhook,
  maxStripeWebhookPayloadBytes: 64 * 1024,
}));

vi.mock("@/lib/webhook-processing-repository", () => ({
  createDynamoDbWebhookProcessingRepository: mocks.createDynamoDbWebhookProcessingRepository,
}));

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(readonly secretKey: string) {}
  },
}));

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveStartupSecretSource.mockReturnValue({
      ok: true,
      value: {
        kind: "awsSecretsManager",
        source: { kind: "source" },
      },
    });
    mocks.validateServerStartupSecrets.mockResolvedValue({
      ok: true,
      value: [{
        apothStage: "staging",
        schemaVersion: 1,
        secretKind: "stripeApi",
        secretKey: "sk_test_opaque",
        webhookSigningSecret: "whsec_opaque",
      }],
    });
    mocks.resolveDynamoDbAppDataConfig.mockReturnValue({
      ok: true,
      value: { tableName: "apoth-staging-app" },
    });
    mocks.resolveWebhookQueueConfig.mockReturnValue({
      ok: true,
      value: { queueUrl: "https://sqs.us-east-1.amazonaws.com/123/webhook" },
    });
    mocks.handleStripeWebhook.mockResolvedValue({
      ok: true,
      status: 200,
      body: { received: true, action: "processed" },
    });
  });

  it("rejects requests before reading app resources when the Stripe signature is missing", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("https://apoth.test/api/webhooks/stripe", {
      body: "{}",
      method: "POST",
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(mocks.handleStripeWebhook).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("passes Stripe CLI-shaped raw event bytes into the webhook service", async () => {
    const { POST } = await import("../route");
    const payload = JSON.stringify({
      id: "evt_opaque_001",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_opaque_001",
          object: "subscription",
          customer: "cus_opaque_001",
          status: "active",
        },
      },
    });

    const response = await POST(new Request("https://apoth.test/api/webhooks/stripe", {
      body: payload,
      headers: { "stripe-signature": "t=123,v1=signature" },
      method: "POST",
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      action: "processed",
    });
    expect(mocks.handleStripeWebhook).toHaveBeenCalledWith(expect.objectContaining({
      payload: Buffer.from(payload),
      signature: "t=123,v1=signature",
    }));
    expect(mocks.resolveStartupSecretSource).toHaveBeenCalledWith({
      env: process.env,
      requiredSecrets: ["stripeApi"],
    });
    expect(mocks.validateServerStartupSecrets).toHaveBeenCalledWith({
      stage: "staging",
      requiredSecrets: ["stripeApi"],
      source: { kind: "source" },
    });
    expect(mocks.createDynamoDbStripeMirrorRepository).toHaveBeenCalledWith({ kind: "dynamodb-repo" });
    expect(mocks.createDynamoDbWebhookProcessingRepository).toHaveBeenCalledWith({ kind: "dynamodb-repo" });
    expect(mocks.createSqsWebhookEnqueue).toHaveBeenCalledWith({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/webhook",
    });
  });

  it("rejects oversized payloads before calling the webhook service", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("https://apoth.test/api/webhooks/stripe", {
      body: "{}",
      headers: {
        "content-length": String(64 * 1024 + 1),
        "stripe-signature": "t=123,v1=signature",
      },
      method: "POST",
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(mocks.handleStripeWebhook).not.toHaveBeenCalled();
  });
});
