import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
const verifyMock = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-dynamodb", () => {
  class Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    DynamoDBClient: class {
      send = sendMock;
    },
    GetItemCommand: class extends Command {
      kind = "GetItem";
    },
    PutItemCommand: class extends Command {
      kind = "PutItem";
    },
  };
});

vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: verifyMock,
    }),
  },
}));

describe("onboarding start lambda", () => {
  beforeEach(() => {
    sendMock.mockReset();
    verifyMock.mockReset();
    process.env.APP_TABLE_NAME = "apoth-staging-app";
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
    verifyMock.mockResolvedValue({ sub: "cognito-sub-start-lambda" });
  });

  it("returns sign-up-first guidance for missing sessions without DynamoDB reads", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");

    const response = await startHandler(event({ omitDefaultCookie: true }));

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      primaryAction: {
        href: "/sign-up?returnTo=%2Fget-started",
        label: "Create account",
      },
      secondaryAction: {
        href: "/sign-in?returnTo=%2Fget-started",
        label: "Sign in",
      },
      status: "account_required",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects invalid sessions before DynamoDB reads", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    verifyMock.mockRejectedValue(new Error("raw Cognito verifier detail"));

    const response = await startHandler(event());

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      code: "invalid_session",
      status: "account_required",
    });
    expect(response.body).not.toContain("raw Cognito");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("creates only a minimal patient profile and starts at consent", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });

    const put = sendMock.mock.calls.find(([command]) =>
      command.kind === "PutItem"
    )?.[0].input as {
      Item: Record<string, unknown>;
      Key?: Record<string, unknown>;
    };
    expect(put.Item).toMatchObject({
      cognitoSub: { S: "cognito-sub-start-lambda" },
      onboardingStatus: { S: "profile_pending" },
      pk: { S: "PATIENT#cognito-sub-start-lambda" },
      recordType: { S: "patientProfile" },
      sk: { S: "PROFILE" },
    });
    expect(JSON.stringify(put)).not.toMatch(
      /mdi|stripe|billing|consent|persona|kyc|questionnaire|answer|diagnosis|symptom|medication/i,
    );
    expectOnlyProfileAccess();
  });

  it.each([
    [{ onboardingStatus: { S: "intake_ready" } }, "/intake"],
    [
      {
        onboardingStatus: { S: "intake_ready" },
        residencyState: { S: "IL" },
      },
      "/onboarding/mdi",
    ],
    [{ onboardingStatus: { S: "mdi_submitted" } }, "/onboarding/mdi"],
    [{ onboardingStatus: { S: "clinical_review" } }, "/onboarding/mdi"],
    [{ onboardingStatus: { S: "billing_ready" } }, "/billing"],
  ])("resumes from profile status %# without linkage reads", async (profile, destination) => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock.mockResolvedValueOnce({
      Item: {
        ...profile,
        recordType: { S: "patientProfile" },
      },
    });

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination,
      status: "ready",
    });
    expectOnlyProfileAccess();
  });

  it("rereads the profile after a concurrent first-create conflict", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(namedError("ConditionalCheckFailedException"))
      .mockResolvedValueOnce({
        Item: {
          onboardingStatus: { S: "intake_ready" },
          recordType: { S: "patientProfile" },
          residencyState: { S: "CA" },
        },
      });

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/mdi",
      status: "ready",
    });
    expectOnlyProfileAccess();
  });
});

function event(overrides: {
  cookies?: string[];
  headers?: Record<string, string>;
  omitDefaultCookie?: boolean;
} = {}) {
  return {
    cookies: overrides.cookies,
    headers: overrides.omitDefaultCookie
      ? overrides.headers ?? {}
      : {
          cookie: "__Host-apoth_access=valid-token",
          ...overrides.headers,
        },
  };
}

function expectOnlyProfileAccess() {
  for (const [command] of sendMock.mock.calls) {
    expect(["GetItem", "PutItem"]).toContain(command.kind);
    const input = command.input as {
      Item?: { pk?: { S?: string }; sk?: { S?: string } };
      Key?: { pk?: { S?: string }; sk?: { S?: string } };
    };
    const key = input.Key ?? input.Item;
    expect(key?.pk?.S).toBe("PATIENT#cognito-sub-start-lambda");
    expect(key?.sk?.S).toBe("PROFILE");
    expect(JSON.stringify(input)).not.toMatch(
      /MDI|STRIPE|BILLING|CONSENT|PERSONA|KYC|QUESTIONNAIRE|ANSWER/i,
    );
  }
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}
