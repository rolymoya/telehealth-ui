import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGatewayEvent } from "../src/lambda/patient-api.js";

const verifyMock = vi.hoisted(() => vi.fn());
const signingMock = vi.hoisted(() => vi.fn());

vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: verifyMock }),
  },
}));
vi.mock("../../src/lib/app-signing-secret.js", () => ({
  resolveAppSigningSecret: signingMock,
}));

describe("staged flow Lambda boundaries", () => {
  beforeEach(() => {
    verifyMock.mockReset();
    verifyMock.mockResolvedValue({
      exp: Math.floor(Date.now() / 1000) + 900,
      sub: "cognito-sub-staged-flow",
    });
    signingMock.mockReset();
    signingMock.mockResolvedValue({
      ok: true,
      value: {
        signingSecret: "test-signing-secret-with-at-least-32-characters",
      },
    });
    process.env.APOTH_ALLOWED_ORIGIN = "https://patient.staging.example";
    process.env.AWS_REGION = "us-east-1";
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
  });

  it("rejects cross-origin passwordless account starts before Cognito or secrets work", async () => {
    const { startHandler } = await import("../src/lambda/email-otp.js");

    const response = await startHandler(event({
      body: JSON.stringify({ email: "synthetic@example.test" }),
      headers: {
        "content-type": "application/json",
        host: "api.staging.example",
        origin: "https://evil.example",
        "x-apoth-auth-intent": "start-precheck-email-otp",
        "x-forwarded-proto": "https",
      },
    }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ error: "invalid_origin" });
  });

  it("rejects passwordless account starts without a signed eligible precheck", async () => {
    const { startHandler } = await import("../src/lambda/email-otp.js");

    const response = await startHandler(event({
      body: JSON.stringify({ email: "synthetic@example.test" }),
      headers: {
        "content-type": "application/json",
        host: "api.staging.example",
        origin: "https://patient.staging.example",
        "x-apoth-auth-intent": "start-precheck-email-otp",
        "x-forwarded-proto": "https",
      },
    }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ error: "precheck_required" });
  });

  it("rejects cross-origin exact-offer acceptance before any billing write", async () => {
    const { offerHandler } = await import("../src/lambda/billing.js");

    const response = await offerHandler(event({
      body: JSON.stringify({
        offerId: "offer_opaque_001",
        recurringAuthorization: "accepted",
      }),
      cookies: ["__Host-apoth_access=opaque-access-token"],
      headers: {
        "content-type": "application/json",
        host: "api.staging.example",
        origin: "https://evil.example",
        "x-apoth-csrf": "invalid",
        "x-forwarded-proto": "https",
      },
    }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ code: "invalid_origin" });
  });

  it("requires an explicit same-origin portal launch intent", async () => {
    const { launchHandler } = await import("../src/lambda/portal.js");

    const response = await launchHandler(event({
      body: "intent=preview",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "api.staging.example",
        origin: "https://patient.staging.example",
        "x-forwarded-proto": "https",
      },
    }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ error: "invalid_request_intent" });
  });
});

function event(overrides: Partial<ApiGatewayEvent>): ApiGatewayEvent {
  return {
    headers: {},
    requestContext: {
      domainName: "api.staging.example",
      http: { method: "POST" },
    },
    ...overrides,
  };
}
