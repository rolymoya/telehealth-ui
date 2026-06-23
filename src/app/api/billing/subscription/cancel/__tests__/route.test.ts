import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelPatientSubscriptionAtPeriodEnd: vi.fn(),
  createDynamoDbAppDataRepository: vi.fn(() => ({ kind: "dynamodb-repo" })),
  createDynamoDbBillingActivationRepository: vi.fn(() => ({ kind: "billing-repo" })),
  createStripeClient: vi.fn(() => ({ kind: "stripe-client" })),
  getServerSession: vi.fn(),
  resolveCognitoAuthConfig: vi.fn(),
  resolveDynamoDbAppDataConfig: vi.fn(),
  resolveRuntimeStage: vi.fn(() => "staging"),
  resolveStartupSecretSource: vi.fn(),
  validateServerStartupSecrets: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getServerSession: mocks.getServerSession,
  resolveCognitoAuthConfig: mocks.resolveCognitoAuthConfig,
}));

vi.mock("@/lib/auth/session-cookie", () => ({
  patientAccessCookieName: "apoth_patient_access",
}));

vi.mock("@/lib/billing-activation", () => ({
  cancelPatientSubscriptionAtPeriodEnd: mocks.cancelPatientSubscriptionAtPeriodEnd,
  createDynamoDbBillingActivationRepository: mocks.createDynamoDbBillingActivationRepository,
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

vi.mock("@/lib/stripe", () => ({
  createStripeClient: mocks.createStripeClient,
}));

describe("billing subscription cancellation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCognitoAuthConfig.mockReturnValue({
      ok: true,
      value: { issuer: "https://cognito.example", userPoolClientId: "client", userPoolId: "pool" },
    });
    mocks.getServerSession.mockResolvedValue({
      ok: true,
      value: { user: { cognitoSub: "cognito-sub-route" } },
    });
    mocks.resolveDynamoDbAppDataConfig.mockReturnValue({
      ok: true,
      value: { tableName: "apoth-staging-app" },
    });
    mocks.resolveStartupSecretSource.mockReturnValue({
      ok: true,
      value: { source: { kind: "source" } },
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
    mocks.cancelPatientSubscriptionAtPeriodEnd.mockResolvedValue({
      ok: true,
      status: "subscription_cancel_pending",
      stripeSubscriptionId: "sub_opaque_001",
    });
  });

  it("requires an authenticated patient before resolving billing resources", async () => {
    mocks.getServerSession.mockResolvedValueOnce({
      ok: false,
      error: { code: "missing_token" },
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
    expect(mocks.cancelPatientSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("schedules cancellation through the server billing service with no PHI response fields", async () => {
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      status: "subscription_cancel_pending",
    });
    expect(mocks.cancelPatientSubscriptionAtPeriodEnd).toHaveBeenCalledWith(expect.objectContaining({
      cognitoSub: "cognito-sub-route",
      repository: { kind: "billing-repo" },
      stage: "staging",
      stripe: { kind: "stripe-client" },
    }));
  });

  it("treats duplicate pending cancellation as a successful no-op", async () => {
    mocks.cancelPatientSubscriptionAtPeriodEnd.mockResolvedValueOnce({
      ok: true,
      status: "already_cancel_pending",
      stripeSubscriptionId: "sub_opaque_001",
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "already_cancel_pending" });
  });

  it("maps missing active subscription linkage to a bounded patient-state conflict", async () => {
    mocks.cancelPatientSubscriptionAtPeriodEnd.mockResolvedValueOnce({
      ok: true,
      status: "not_active",
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "subscription_not_active" });
  });

  it("hides Stripe and storage failures behind billing_unavailable", async () => {
    mocks.cancelPatientSubscriptionAtPeriodEnd.mockResolvedValueOnce({
      ok: false,
      code: "stripe_unavailable",
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "billing_unavailable" });
  });
});

function request(url = "https://apoth.test/api/billing/subscription/cancel") {
  return new NextRequest(url, {
    headers: { cookie: "apoth_patient_access=token" },
    method: "POST",
  });
}
