import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.hoisted(() => vi.fn());

vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: verifyMock,
    }),
  },
}));

describe("auth session lambda handlers", () => {
  beforeEach(() => {
    verifyMock.mockReset();
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
  });

  it("sets the static API session cookie for a valid Cognito access token", async () => {
    const { postHandler } = await import("../src/lambda/auth-session.js");
    verifyMock.mockResolvedValue({
      exp: Math.floor(Date.now() / 1000) + 900,
      sub: "cognito-sub-auth-session",
    });

    const response = await postHandler({
      body: JSON.stringify({ accessToken: "valid-token" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      authenticated: true,
      user: { cognitoSub: "cognito-sub-auth-session" },
    });
    expect(response.cookies?.[0]).toContain(
      "__Host-apoth_access=valid-token",
    );
    expect(response.cookies?.[0]).toContain("HttpOnly");
    expect(response.cookies?.[0]).toContain("Secure");
    expect(response.cookies?.[0]).toContain("SameSite=Lax");
    expect("multiValueHeaders" in response).toBe(false);
  });

  it("rejects missing or invalid access tokens without setting a cookie", async () => {
    const { postHandler } = await import("../src/lambda/auth-session.js");
    verifyMock.mockRejectedValue(new Error("invalid"));

    const missing = await postHandler({ body: "{}" });
    expect(missing.statusCode).toBe(401);
    expect(missing.cookies).toBeUndefined();

    const invalid = await postHandler({
      body: JSON.stringify({ accessToken: "invalid-token" }),
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.cookies).toBeUndefined();
  });

  it("clears the static API session cookie", async () => {
    const { deleteHandler } = await import("../src/lambda/auth-session.js");

    const response = await deleteHandler();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "session_cleared" });
    expect(response.cookies?.[0]).toContain(
      "__Host-apoth_access=",
    );
    expect(response.cookies?.[0]).toContain("Max-Age=0");
    expect("multiValueHeaders" in response).toBe(false);
  });
});
