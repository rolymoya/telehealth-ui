import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousPrecheckContextCookieName,
  createAnonymousPrecheckContext,
  type AppSigningSecret,
} from "../../shared/intake/anonymous-precheck-context";

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
    TransactWriteItemsCommand: class extends Command {
      kind = "TransactWriteItems";
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
    process.env.APOTH_ALLOW_ENV_SECRET_PAYLOADS = "true";
    process.env.APOTH_REQUIRED_SERVER_SECRETS = "appSigning";
    process.env.APOTH_SECRET_APP_SIGNING_JSON = JSON.stringify({
      apothStage: "staging",
      schemaVersion: 1,
      secretKind: "appSigning",
      signingSecret: "lambda-start-signing-secret",
    });
    process.env.APOTH_STAGE = "staging";
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

  it("binds a valid anonymous precheck context with only minimal profile data and stops at consent", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await startHandler(event({
      headers: {
        cookie: [
          "__Host-apoth_access=valid-token",
          mintAnonymousPrecheckCookie(),
        ].join("; "),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
    expect(response.cookies?.[0]).toContain(`${anonymousPrecheckContextCookieName}=`);
    expect(response.cookies?.[0]).toContain("Max-Age=0");

    const transaction = sendMock.mock.calls.find(([command]) =>
      command.kind === "TransactWriteItems"
    )?.[0].input as { TransactItems: Array<Record<string, unknown>> };
    expect(transaction.TransactItems).toHaveLength(2);
    expect(JSON.stringify(transaction)).toContain("anonymousPrecheckConsumption");
    expect(JSON.stringify(transaction)).toContain("intake_ready");
    expect(JSON.stringify(transaction)).toContain("IL");
    expect(JSON.stringify(transaction)).not.toMatch(
      /weight|answer|questionnaire|emergency|contraindication|medication|mdi|stripe|billing/i,
    );
  });

  it("routes anonymous precheck bind to MDI after pre-MDI consent evidence exists", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence());

    const response = await startHandler(event({
      headers: {
        cookie: [
          "__Host-apoth_access=valid-token",
          mintAnonymousPrecheckCookie(),
        ].join("; "),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/mdi",
      status: "ready",
    });
    expect(response.cookies?.[0]).toContain("Max-Age=0");
    expect(sendMock).toHaveBeenCalledTimes(6);
  });

  it("only fills a missing intake-ready residency state when it is still absent", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          onboardingStatus: { S: "intake_ready" },
          recordType: { S: "patientProfile" },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await startHandler(event({
      headers: {
        cookie: [
          "__Host-apoth_access=valid-token",
          mintAnonymousPrecheckCookie(),
        ].join("; "),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
    const transaction = sendMock.mock.calls.find(([command]) =>
      command.kind === "TransactWriteItems"
    )?.[0].input as {
      TransactItems: Array<{
        Update?: { ConditionExpression?: string };
      }>;
    };
    const update = transaction.TransactItems.find((item) => item.Update)?.Update;
    expect(update?.ConditionExpression).toBe(
      "#status = :expected AND attribute_not_exists(#residencyState)",
    );
  });

  it("keeps anonymous billing-ready starts at consent until full consent evidence exists", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          onboardingStatus: { S: "billing_ready" },
          recordType: { S: "patientProfile" },
          residencyState: { S: "IL" },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce({});

    const response = await startHandler(event({
      headers: {
        cookie: [
          "__Host-apoth_access=valid-token",
          mintAnonymousPrecheckCookie(),
        ].join("; "),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
    expect(response.cookies?.[0]).toContain("Max-Age=0");
  });

  it("routes cross-account anonymous precheck replay to consent before intake recovery", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({
        Item: {
          cognitoSub: { S: "cognito-sub-otheraccount" },
          recordType: { S: "anonymousPrecheckConsumption" },
        },
      })
      .mockResolvedValueOnce({});

    const response = await startHandler(event({
      headers: {
        cookie: [
          "__Host-apoth_access=valid-token",
          mintAnonymousPrecheckCookie(),
        ].join("; "),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
    expect(response.cookies?.[0]).toContain("Max-Age=0");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a bind transaction cancels before consumption exists", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(namedError("TransactionCanceledException"))
      .mockResolvedValueOnce({});

    const response = await startHandler(event({
      headers: {
        cookie: [
          "__Host-apoth_access=valid-token",
          mintAnonymousPrecheckCookie(),
        ].join("; "),
      },
    }));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      code: "anonymous_precheck_bind_failed",
    });
    expect(response.cookies).toBeUndefined();
  });

  it.each([
    [{ onboardingStatus: { S: "intake_ready" } }],
    [
      {
        onboardingStatus: { S: "intake_ready" },
        residencyState: { S: "IL" },
      },
    ],
    [{ onboardingStatus: { S: "mdi_submitted" } }],
    [{ onboardingStatus: { S: "clinical_review" } }],
    [{ onboardingStatus: { S: "billing_ready" } }],
  ])("routes profile status %# to consent when consent evidence is missing", async (profile) => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({
        Item: {
          ...profile,
          recordType: { S: "patientProfile" },
        },
      })
      .mockResolvedValueOnce({});

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
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
  ])("resumes from profile status %# after pre-MDI consent evidence exists", async (profile, destination) => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({
        Item: {
          ...profile,
          recordType: { S: "patientProfile" },
        },
      })
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence());

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination,
      status: "ready",
    });
  });

  it("resumes billing after full current consent evidence exists", async () => {
    const { startHandler } = await import("../src/lambda/onboarding-start.js");
    sendMock
      .mockResolvedValueOnce({
        Item: {
          onboardingStatus: { S: "billing_ready" },
          recordType: { S: "patientProfile" },
        },
      })
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence())
      .mockResolvedValueOnce(consentEvidence());

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/billing",
      status: "ready",
    });
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
      })
      .mockResolvedValueOnce({});

    const response = await startHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
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

function consentEvidence() {
  return {
    Item: {
      recordType: { S: "consentEvidence" },
    },
  };
}

function mintAnonymousPrecheckCookie() {
  const secret: AppSigningSecret = {
    signingSecret: "lambda-start-signing-secret",
  };
  const value = createAnonymousPrecheckContext({
    nonce: "lambda-start-anonymous-precheck",
    residencyState: "IL",
    secret,
    selectedTreatment: "weight",
  });
  return `${anonymousPrecheckContextCookieName}=${encodeURIComponent(value)}`;
}
