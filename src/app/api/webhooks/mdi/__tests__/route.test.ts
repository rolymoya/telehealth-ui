import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDynamoDbAppDataRepository: vi.fn(() => ({ kind: "dynamodb-repo" })),
  createDynamoDbMdiWebhookMirrorRepository: vi.fn(() => ({ kind: "mdi-mirror" })),
  createDynamoDbWebhookProcessingRepository: vi.fn(() => ({ kind: "webhook-repo" })),
  handleMdiWebhook: vi.fn(),
  resolveDynamoDbAppDataConfig: vi.fn(),
  resolveRuntimeStage: vi.fn(() => "staging"),
  resolveStartupSecretSource: vi.fn(),
  validateServerStartupSecrets: vi.fn(),
}));

vi.mock("@/lib/dynamodb/app-data-dynamodb", () => ({
  createDynamoDbAppDataRepository: mocks.createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig: mocks.resolveDynamoDbAppDataConfig,
}));

vi.mock("@/lib/mdi-webhooks", () => ({
  createDynamoDbMdiWebhookMirrorRepository: mocks.createDynamoDbMdiWebhookMirrorRepository,
  handleMdiWebhook: mocks.handleMdiWebhook,
  maxMdiWebhookPayloadBytes: 64 * 1024,
}));

vi.mock("@/lib/secrets/startup", () => ({
  resolveRuntimeStage: mocks.resolveRuntimeStage,
  resolveStartupSecretSource: mocks.resolveStartupSecretSource,
  validateServerStartupSecrets: mocks.validateServerStartupSecrets,
}));

vi.mock("@/lib/webhook-processing-repository", () => ({
  createDynamoDbWebhookProcessingRepository: mocks.createDynamoDbWebhookProcessingRepository,
}));

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(readonly secretKey: string) {}
  },
}));

describe("MDI webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_RECURRING_PRICE_ID", "price_launch_opaque_001");
    mocks.resolveStartupSecretSource.mockReturnValue({
      ok: true,
      value: {
        kind: "awsSecretsManager",
        source: { kind: "source" },
      },
    });
    mocks.validateServerStartupSecrets.mockImplementation(async (input) => {
      if (input.requiredSecrets.includes("stripeApi")) {
        return {
          ok: true,
          value: [{
            apothStage: "staging",
            schemaVersion: 1,
            secretKind: "stripeApi",
            secretKey: "sk_test_opaque",
            webhookSigningSecret: "whsec_opaque",
          }],
        };
      }
      return {
        ok: true,
        value: [{
          apiBaseUrl: "https://mdi.example.test",
          apothStage: "staging",
          clientId: "mdi_client_opaque",
          clientSecret: "mdi_client_secret_opaque",
          schemaVersion: 1,
          secretKind: "mdiApi",
          webhookAuthorizationSecret: "mdi_authorization_opaque",
          webhookSigningSecret: "mdi_signing_opaque",
        }],
      };
    });
    mocks.resolveDynamoDbAppDataConfig.mockReturnValue({
      ok: true,
      value: { tableName: "apoth-staging-app" },
    });
    mocks.handleMdiWebhook.mockResolvedValue({
      ok: true,
      status: 200,
      body: { received: true, action: "processed" },
    });
  });

  it("rejects requests before reading app resources when MDI auth headers are missing", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("https://apoth.test/api/webhooks/mdi", {
      body: "{}",
      method: "POST",
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(mocks.handleMdiWebhook).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("passes raw event bytes and MDI auth material into the webhook service", async () => {
    const { POST } = await import("../route");
    const payload = JSON.stringify({
      case_id: "mdi_case_opaque_001",
      event_type: "case_processing",
      timestamp: 1_781_007_200,
    });

    const response = await POST(new Request("https://apoth.test/api/webhooks/mdi", {
      body: payload,
      headers: {
        authorization: "Bearer mdi_authorization_opaque",
        signature: "sha256=opaque",
      },
      method: "POST",
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      action: "processed",
    });
    expect(mocks.handleMdiWebhook).toHaveBeenCalledWith(expect.objectContaining({
      authorization: "Bearer mdi_authorization_opaque",
      payload: Buffer.from(payload),
      signature: "sha256=opaque",
    }));
    expect(mocks.resolveStartupSecretSource).toHaveBeenCalledWith({
      env: process.env,
      requiredSecrets: ["mdiApi"],
    });
    expect(mocks.validateServerStartupSecrets).toHaveBeenCalledWith({
      stage: "staging",
      requiredSecrets: ["mdiApi"],
      source: { kind: "source" },
    });
    expect(mocks.createDynamoDbMdiWebhookMirrorRepository).toHaveBeenCalledWith({ kind: "dynamodb-repo" });
    expect(mocks.createDynamoDbWebhookProcessingRepository).toHaveBeenCalledWith({ kind: "dynamodb-repo" });
  });

  it("rejects oversized payloads before calling the webhook service", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("https://apoth.test/api/webhooks/mdi", {
      body: "{}",
      headers: {
        authorization: "Bearer mdi_authorization_opaque",
        "content-length": String(64 * 1024 + 1),
        signature: "sha256=opaque",
      },
      method: "POST",
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(mocks.handleMdiWebhook).not.toHaveBeenCalled();
    expect(mocks.resolveStartupSecretSource).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("returns startup dependency failures without calling the webhook service", async () => {
    mocks.resolveDynamoDbAppDataConfig.mockReturnValueOnce({
      ok: false,
      error: "table unavailable",
    });
    const { POST } = await import("../route");
    const response = await POST(new Request("https://apoth.test/api/webhooks/mdi", {
      body: "{}",
      headers: {
        authorization: "Bearer mdi_authorization_opaque",
        signature: "sha256=opaque",
      },
      method: "POST",
    }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "webhook_processing_failed" });
    expect(mocks.handleMdiWebhook).not.toHaveBeenCalled();
  });
});
