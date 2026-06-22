import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDynamoDbAppDataRepository: vi.fn(() => ({ kind: "dynamodb-repo" })),
  createDynamoDbPaymentMethodCollectionRepository: vi.fn(() => ({ kind: "billing-repo" })),
  createStripeClient: vi.fn(() => ({ kind: "stripe-client" })),
  getServerSession: vi.fn(),
  preparePaymentMethodCollection: vi.fn(),
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

vi.mock("@/lib/billing-payment-method", () => ({
  createDynamoDbPaymentMethodCollectionRepository: mocks.createDynamoDbPaymentMethodCollectionRepository,
  preparePaymentMethodCollection: mocks.preparePaymentMethodCollection,
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

describe("billing payment-method route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://apoth.test");
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
    mocks.preparePaymentMethodCollection.mockResolvedValue({
      ok: true,
      status: "checkout_session_created",
      billingStatus: "payment_method_pending",
      checkoutSessionId: "cs_opaque_001",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_opaque_001",
      stripeCustomerId: "cus_opaque_001",
    });
  });

  it("requires an authenticated patient session before resolving billing resources", async () => {
    mocks.getServerSession.mockResolvedValueOnce({
      ok: false,
      error: { code: "missing_token" },
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.preparePaymentMethodCollection).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("returns a non-cacheable hosted Checkout setup session response", async () => {
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      billingStatus: "payment_method_pending",
      checkoutSessionId: "cs_opaque_001",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_opaque_001",
      status: "checkout_session_created",
    });
    expect(mocks.preparePaymentMethodCollection).toHaveBeenCalledWith(expect.objectContaining({
      cognitoSub: "cognito-sub-route",
      urls: {
        cancelUrl: "https://apoth.test/billing",
        successUrl: "https://apoth.test/dashboard",
      },
    }));
  });

  it("uses the configured site origin for Stripe return URLs instead of a hostile request host", async () => {
    const { POST } = await import("../route");

    const response = await POST(request("https://evil.test/api/billing/payment-method"));

    expect(response.status).toBe(200);
    expect(mocks.preparePaymentMethodCollection).toHaveBeenCalledWith(expect.objectContaining({
      urls: {
        cancelUrl: "https://apoth.test/billing",
        successUrl: "https://apoth.test/dashboard",
      },
    }));
  });

  it("maps declined cases to a patient-state conflict without Stripe secrets", async () => {
    mocks.preparePaymentMethodCollection.mockResolvedValueOnce({
      ok: false,
      code: "clinical_declined",
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({ error: "clinical_declined" });
  });

  it("hides retryable internal billing failure details behind a public outage code", async () => {
    mocks.preparePaymentMethodCollection.mockResolvedValueOnce({
      ok: false,
      code: "invalid_stripe_metadata",
    });
    const { POST } = await import("../route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({ error: "billing_unavailable" });
  });
});

function request(url = "https://apoth.test/api/billing/payment-method") {
  return new NextRequest(url, {
    headers: { cookie: "apoth_patient_access=token" },
    method: "POST",
  });
}
