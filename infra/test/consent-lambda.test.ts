import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consentAcknowledgementFieldName,
  currentRequiredConsents,
} from "../../shared/consents";

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

describe("consent lambda handler", () => {
  beforeEach(() => {
    sendMock.mockReset();
    verifyMock.mockReset();
    process.env.APP_TABLE_NAME = "apoth-staging-app";
    process.env.APOTH_ALLOWED_ORIGIN = "http://localhost:3000";
    process.env.APOTH_ALLOWED_ORIGINS = "http://localhost:3000,https://static.example.cloudfront.net";
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
    verifyMock.mockResolvedValue({ sub: "cognito-sub-consent-lambda" });
  });

  it("rejects missing sessions before DynamoDB writes", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");

    const response = await acceptHandler(event({
      omitDefaultCookie: true,
    }));

    expect(response.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects bad origins and missing acknowledgement before writes", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");

    await expect(acceptHandler(event({
      headers: { origin: "https://evil.example" },
    }))).resolves.toMatchObject({
      statusCode: 403,
    });

    await expect(acceptHandler(event({
      body: JSON.stringify({ acknowledgements: {} }),
    }))).resolves.toMatchObject({
      statusCode: 422,
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("writes only consent evidence records and returns the intake destination", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    sendMock.mockResolvedValue({});

    const response = await acceptHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      destination: "/intake",
      status: "consent_recorded",
    });

    const transaction = sendMock.mock.calls.find(([command]) =>
      command.kind === "TransactWriteItems"
    )?.[0].input as {
      TransactItems: Array<{ Put: { Item: Record<string, { S?: string }> } }>;
    };
    expect(transaction.TransactItems).toHaveLength(currentRequiredConsents.length);
    expect(JSON.stringify(transaction)).toContain("consentEvidence");
    expect(JSON.stringify(transaction)).not.toContain("emergency");
    expect(JSON.stringify(transaction)).not.toContain("weight");
  });

  it("accepts the deployed static CloudFront origin", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    sendMock.mockResolvedValue({});

    const response = await acceptHandler(event({
      headers: {
        origin: "https://static.example.cloudfront.net",
      },
    }));

    expect(response.statusCode).toBe(200);
  });

  it("is idempotent when all current consent evidence already exists", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as { Key?: { sk?: { S?: string } } };
      return input.Key?.sk?.S?.startsWith("CONSENT#")
        ? { Item: { recordType: { S: "consentEvidence" } } }
        : {};
    });

    const response = await acceptHandler(event());

    expect(response.statusCode).toBe(200);
    expect(sendMock.mock.calls.some(([command]) =>
      command.kind === "TransactWriteItems"
    )).toBe(false);
  });
});

function event(options: {
  body?: string;
  headers?: Record<string, string>;
  omitDefaultCookie?: boolean;
} = {}) {
  return {
    body: options.body ?? JSON.stringify({ acknowledgements: acceptedAcks() }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...(options.omitDefaultCookie ? {} : { cookie: "__Host-apoth_access=valid-token" }),
      ...options.headers,
    },
  };
}

function acceptedAcks() {
  return Object.fromEntries(
    currentRequiredConsents.map((consent) => [
      consentAcknowledgementFieldName(consent),
      "accepted",
    ]),
  );
}
