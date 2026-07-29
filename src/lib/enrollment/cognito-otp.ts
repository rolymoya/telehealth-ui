import "server-only";

import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  ListUsersCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { EnrollmentOtpCognito } from "@/lib/enrollment/otp-service";

type CognitoOtpCommand =
  | AdminCreateUserCommand
  | InitiateAuthCommand
  | ListUsersCommand
  | RespondToAuthChallengeCommand;

type CognitoOtpClient = {
  send(command: CognitoOtpCommand): Promise<unknown>;
};

export type CognitoEmailOtpAdapter = EnrollmentOtpCognito & {
  confirmEmailOtp(input: {
    code: string;
    session: string;
    username: string;
  }): Promise<
    | {
      ok: true;
      accessToken: string;
      idToken: string;
      expiresIn: number;
    }
    | { ok: false; code: string }
  >;
};

export function createDefaultCognitoEmailOtpAdapter(input: {
  region: string;
  userPoolClientId: string;
  userPoolId: string;
}): CognitoEmailOtpAdapter {
  const client = new CognitoIdentityProviderClient({ region: input.region });
  return createCognitoEmailOtpAdapter({
    ...input,
    client: client as unknown as CognitoOtpClient,
  });
}

export function createCognitoEmailOtpAdapter(input: {
  client: CognitoOtpClient;
  userPoolClientId: string;
  userPoolId: string;
}): CognitoEmailOtpAdapter {
  async function findUser(email: string) {
    try {
      const response = await input.client.send(new ListUsersCommand({
        Filter: `email = "${escapeFilter(email)}"`,
        Limit: 2,
        UserPoolId: input.userPoolId,
      }));
      const users = isRecord(response) && Array.isArray(response.Users)
        ? response.Users
        : [];
      const usernames = users.flatMap((user) =>
        isRecord(user) && typeof user.Username === "string"
          ? [user.Username]
          : []
      );
      if (usernames.length > 1) {
        return { ok: false as const, code: "identity_conflict" };
      }
      return { ok: true as const, username: usernames[0] ?? null };
    } catch {
      return { ok: false as const, code: "identity_unavailable" };
    }
  }

  return {
    async ensurePasswordlessUser({ email, preferredUsername }) {
      const existing = await findUser(email);
      if (!existing.ok) {
        return existing;
      }
      if (existing.username) {
        return { ok: true, username: existing.username };
      }

      try {
        const response = await input.client.send(new AdminCreateUserCommand({
          MessageAction: "SUPPRESS",
          UserAttributes: [{ Name: "email", Value: email }],
          Username: preferredUsername,
          UserPoolId: input.userPoolId,
        }));
        const username = isRecord(response) && isRecord(response.User) &&
            typeof response.User.Username === "string"
          ? response.User.Username
          : "";
        return username
          ? { ok: true, username }
          : { ok: false, code: "identity_unavailable" };
      } catch (error) {
        if (errorName(error) === "UsernameExistsException") {
          const raced = await findUser(email);
          return raced.ok && raced.username
            ? { ok: true, username: raced.username }
            : { ok: false, code: "identity_conflict" };
        }
        return { ok: false, code: "identity_unavailable" };
      }
    },

    async startEmailOtp({ username }) {
      try {
        const response = await input.client.send(new InitiateAuthCommand({
          AuthFlow: "USER_AUTH",
          AuthParameters: {
            PREFERRED_CHALLENGE: "EMAIL_OTP",
            USERNAME: username,
          },
          ClientId: input.userPoolClientId,
        }));
        if (
          !isRecord(response) ||
          response.ChallengeName !== "EMAIL_OTP" ||
          typeof response.Session !== "string"
        ) {
          return { ok: false, code: "unsupported_challenge" };
        }
        return {
          ok: true,
          challengeName: "EMAIL_OTP",
          session: response.Session,
        };
      } catch {
        return { ok: false, code: "identity_unavailable" };
      }
    },

    async confirmEmailOtp({ code, session, username }) {
      try {
        const response = await input.client.send(new RespondToAuthChallengeCommand({
          ChallengeName: "EMAIL_OTP",
          ChallengeResponses: {
            EMAIL_OTP_CODE: code,
            USERNAME: username,
          },
          ClientId: input.userPoolClientId,
          Session: session,
        }));
        const authentication = isRecord(response) && isRecord(response.AuthenticationResult)
          ? response.AuthenticationResult
          : null;
        if (
          !authentication ||
          typeof authentication.AccessToken !== "string" ||
          typeof authentication.IdToken !== "string" ||
          typeof authentication.ExpiresIn !== "number"
        ) {
          return { ok: false, code: "invalid_code" };
        }
        return {
          ok: true,
          accessToken: authentication.AccessToken,
          idToken: authentication.IdToken,
          expiresIn: authentication.ExpiresIn,
        };
      } catch (error) {
        const name = errorName(error);
        return {
          ok: false,
          code: name === "CodeMismatchException" || name === "ExpiredCodeException"
            ? "invalid_code"
            : name === "TooManyRequestsException"
              ? "rate_limited"
              : "identity_unavailable",
        };
      }
    },
  };
}

function escapeFilter(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function errorName(value: unknown) {
  return isRecord(value) && typeof value.name === "string" ? value.name : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
