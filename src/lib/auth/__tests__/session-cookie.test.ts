import { describe, expect, it } from "vitest";
import {
  createAuthSessionCookie,
  createClearedAuthSessionCookie,
  patientAccessCookieName,
} from "@/lib/auth/session-cookie";
import {
  cognitoIssuer,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";

const now = new Date("2026-06-09T16:00:00.000Z");
const config: CognitoAuthConfig = {
  provider: "cognito",
  authMode: "password_auth_no_hosted_ui",
  region: "us-east-1",
  userPoolId: "us-east-1_urOM8PctH",
  userPoolClientId: "2i8kvm8c840gfou4qvlm67u2be",
  issuer: cognitoIssuer("us-east-1", "us-east-1_urOM8PctH"),
  hostedUi: {
    enabled: false,
    domain: null,
    callbackUrls: [],
    logoutUrls: [],
  },
};

describe("auth session cookie transport", () => {
  it("verifies an access token before creating an HttpOnly cookie", async () => {
    const token = "opaque-access-token";
    const result = await createAuthSessionCookie({
      config,
      now,
      secure: true,
      token,
      verifier: verifierFor({
        exp: Math.floor(now.getTime() / 1000) + 900,
      }),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        cookie: {
          httpOnly: true,
          maxAge: 900,
          name: patientAccessCookieName,
          path: "/",
          sameSite: "lax",
          secure: true,
          value: token,
        },
        response: {
          authenticated: true,
          expiresAt: "2026-06-09T16:15:00.000Z",
          user: {
            cognitoSub: "cognito-sub-0123456789abcdef",
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("patient@example.com");
  });

  it("fails closed and does not create a cookie for an invalid token", async () => {
    const result = await createAuthSessionCookie({
      config,
      now,
      secure: true,
      token: "bad-token",
      verifier: {
        async verify() {
          throw new Error("bad token");
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_token",
        message: "Cognito access token could not be verified",
      },
    });
  });

  it("clears the access cookie without exposing token values", () => {
    expect(createClearedAuthSessionCookie({ secure: true })).toEqual({
      httpOnly: true,
      maxAge: 0,
      name: patientAccessCookieName,
      path: "/",
      sameSite: "lax",
      secure: true,
      value: "",
    });
  });
});

function verifierFor(overrides: {
  exp: number;
}): AuthTokenVerifier {
  return {
    async verify() {
      return {
        client_id: config.userPoolClientId,
        exp: overrides.exp,
        iat: Math.floor(now.getTime() / 1000),
        iss: config.issuer,
        sub: "cognito-sub-0123456789abcdef",
        token_use: "access",
      };
    },
  };
}
