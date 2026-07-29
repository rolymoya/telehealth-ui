import {
  AdminCreateUserCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it, vi } from "vitest";
import { createCognitoEmailOtpAdapter } from "@/lib/enrollment/cognito-otp";

describe("Cognito passwordless email OTP adapter", () => {
  it("creates a passwordless confirmed user without an invitation or password", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Users: [] })
      .mockResolvedValueOnce({ User: { Username: "apoth_opaque_username" } });
    const adapter = createCognitoEmailOtpAdapter({
      client: { send },
      userPoolClientId: "client_opaque_001",
      userPoolId: "us-east-1_poolopaque",
    });

    expect(await adapter.ensurePasswordlessUser({
      email: "patient@example.com",
      preferredUsername: "apoth_opaque_username",
    })).toEqual({ ok: true, username: "apoth_opaque_username" });

    expect(send.mock.calls[0][0]).toBeInstanceOf(ListUsersCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      Filter: "email = \"patient@example.com\"",
      Limit: 2,
      UserPoolId: "us-east-1_poolopaque",
    });
    expect(send.mock.calls[1][0]).toBeInstanceOf(AdminCreateUserCommand);
    expect(send.mock.calls[1][0].input).toEqual({
      MessageAction: "SUPPRESS",
      UserAttributes: [{ Name: "email", Value: "patient@example.com" }],
      Username: "apoth_opaque_username",
      UserPoolId: "us-east-1_poolopaque",
    });
    expect("TemporaryPassword" in send.mock.calls[1][0].input).toBe(false);
  });

  it("starts and completes USER_AUTH with the EMAIL_OTP challenge", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({
        ChallengeName: "EMAIL_OTP",
        Session: "cognito-session-secret-opaque-value-at-least-20",
      })
      .mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: "access-token-opaque",
          IdToken: "id-token-opaque",
          ExpiresIn: 3600,
        },
      });
    const adapter = createCognitoEmailOtpAdapter({
      client: { send },
      userPoolClientId: "client_opaque_001",
      userPoolId: "us-east-1_poolopaque",
    });

    expect(await adapter.startEmailOtp({
      username: "apoth_opaque_username",
    })).toMatchObject({ ok: true, challengeName: "EMAIL_OTP" });
    expect(send.mock.calls[0][0]).toBeInstanceOf(InitiateAuthCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      AuthFlow: "USER_AUTH",
      AuthParameters: {
        PREFERRED_CHALLENGE: "EMAIL_OTP",
        USERNAME: "apoth_opaque_username",
      },
      ClientId: "client_opaque_001",
    });

    expect(await adapter.confirmEmailOtp({
      code: "123456",
      session: "cognito-session-secret-opaque-value-at-least-20",
      username: "apoth_opaque_username",
    })).toEqual({
      ok: true,
      accessToken: "access-token-opaque",
      idToken: "id-token-opaque",
      expiresIn: 3600,
    });
    expect(send.mock.calls[1][0]).toBeInstanceOf(RespondToAuthChallengeCommand);
    expect(send.mock.calls[1][0].input).toEqual({
      ChallengeName: "EMAIL_OTP",
      ChallengeResponses: {
        EMAIL_OTP_CODE: "123456",
        USERNAME: "apoth_opaque_username",
      },
      ClientId: "client_opaque_001",
      Session: "cognito-session-secret-opaque-value-at-least-20",
    });
  });
});
