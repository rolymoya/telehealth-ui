import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consentAcknowledgementFieldName,
  currentRequiredConsents,
  requiredConsentsBeforeMdi,
  requiredMedicationDisclosureConsents,
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
    PutItemCommand: class extends Command {
      kind = "PutItem";
    },
    TransactWriteItemsCommand: class extends Command {
      kind = "TransactWriteItems";
    },
    UpdateItemCommand: class extends Command {
      kind = "UpdateItem";
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

  it("writes consent evidence, advances only the minimal profile status, and returns intake", async () => {
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
    expect(transaction.TransactItems).toHaveLength(requiredConsentsBeforeMdi().length);
    expect(JSON.stringify(transaction)).toContain("consentEvidence");
    expect(JSON.stringify(transaction)).not.toContain("emergency");
    expect(JSON.stringify(transaction)).not.toContain("weight");
    expect(JSON.stringify(transaction)).not.toContain("compounded_medication_disclosure");

    const profilePut = sendMock.mock.calls.find(([command]) =>
      command.kind === "PutItem"
    )?.[0].input as {
      Item: Record<string, { S?: string }>;
    };
    expect(profilePut.Item).toMatchObject({
      onboardingStatus: { S: "intake_ready" },
      pk: { S: "PATIENT#cognito-sub-consent-lambda" },
      recordType: { S: "patientProfile" },
      sk: { S: "PROFILE" },
    });
    expect(JSON.stringify(profilePut)).not.toMatch(
      /mdi|stripe|billing|persona|kyc|questionnaire|answer|diagnosis|symptom|medication/i,
    );
  });

  it("advances an existing profile_pending profile so start/resume can use profile-only routing", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as { Key?: { sk?: { S?: string } } };
      if (command.kind === "GetItem" && input.Key?.sk?.S?.startsWith("CONSENT#")) {
        return { Item: { recordType: { S: "consentEvidence" } } };
      }
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        return {
          Item: {
            onboardingStatus: { S: "profile_pending" },
            recordType: { S: "patientProfile" },
          },
        };
      }
      return {};
    });

    const response = await acceptHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      destination: "/intake",
      status: "consent_recorded",
    });
    const profileUpdate = sendMock.mock.calls.find(([command]) =>
      command.kind === "UpdateItem"
    )?.[0].input as {
      ExpressionAttributeValues: Record<string, { S: string }>;
      Key: { pk: { S: string }; sk: { S: string } };
    };
    expect(profileUpdate.Key).toEqual({
      pk: { S: "PATIENT#cognito-sub-consent-lambda" },
      sk: { S: "PROFILE" },
    });
    expect(profileUpdate.ExpressionAttributeValues[":intakeReady"]).toEqual({
      S: "intake_ready",
    });
    expect(JSON.stringify(profileUpdate)).not.toMatch(
      /mdi|stripe|billing|persona|kyc|questionnaire|answer/i,
    );
  });

  it("updates a concurrently created profile_pending profile after a create conflict", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    let profileReads = 0;
    sendMock.mockImplementation(async (command) => {
      const input = command.input as { Key?: { sk?: { S?: string } } };
      if (command.kind === "GetItem" && input.Key?.sk?.S?.startsWith("CONSENT#")) {
        return { Item: { recordType: { S: "consentEvidence" } } };
      }
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        profileReads += 1;
        if (profileReads === 1) {
          return {};
        }
        return {
          Item: {
            onboardingStatus: {
              S: profileReads === 2 ? "profile_pending" : "intake_ready",
            },
            recordType: { S: "patientProfile" },
          },
        };
      }
      if (command.kind === "PutItem") {
        throw namedError("ConditionalCheckFailedException");
      }
      return {};
    });

    const response = await acceptHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      destination: "/intake",
      status: "consent_recorded",
    });
    expect(sendMock.mock.calls.some(([command]) =>
      command.kind === "UpdateItem"
    )).toBe(true);
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

  it("does not record medication disclosure before MDI submission and case linkage", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as { Key?: { sk?: { S?: string } } };
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        return {
          Item: {
            onboardingStatus: { S: "intake_ready" },
            recordType: { S: "patientProfile" },
          },
        };
      }
      return {};
    });

    const response = await acceptHandler(event({
      body: JSON.stringify({
        acknowledgements: acceptedAcks(requiredMedicationDisclosureConsents({ treatment: "weight" })),
        gate: "post_questionnaire_medication",
      }),
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/mdi",
      status: "consent_recorded",
    });
    expect(sendMock.mock.calls.some(([command]) =>
      command.kind === "TransactWriteItems"
    )).toBe(false);
  });

  it("records only applicable medication disclosure after MDI submission and case linkage", async () => {
    const { acceptHandler } = await import("../src/lambda/consent.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as { Key?: { sk?: { S?: string } } };
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        return {
          Item: {
            onboardingStatus: { S: "mdi_submitted" },
            recordType: { S: "patientProfile" },
          },
        };
      }
      if (command.kind === "GetItem" && input.Key?.sk?.S === "MDI#LINKAGE") {
        return {
          Item: {
            mdiCaseId: { S: "mdi_case_consent_lambda_001" },
            mdiPatientId: { S: "mdi_patient_consent_lambda_001" },
            recordType: { S: "mdiLinkage" },
          },
        };
      }
      if (command.kind === "GetItem" && input.Key?.sk?.S === "MDI#QUESTIONNAIRE_SELECTION") {
        return {
          Item: {
            questionnaireId: { S: "mdi_questionnaire_weight" },
            recordType: { S: "onboardingTreatmentSelection" },
            treatment: { S: "weight" },
          },
        };
      }
      return {};
    });

    const response = await acceptHandler(event({
      body: JSON.stringify({
        acknowledgements: acceptedAcks(requiredMedicationDisclosureConsents({ treatment: "weight" })),
        gate: "post_questionnaire_medication",
      }),
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      destination: "/onboarding/mdi",
      status: "consent_recorded",
    });
    const transaction = sendMock.mock.calls.find(([command]) =>
      command.kind === "TransactWriteItems"
    )?.[0].input as {
      TransactItems: Array<{ Put: { Item: Record<string, { S?: string }> } }>;
    };
    expect(transaction.TransactItems).toHaveLength(1);
    expect(JSON.stringify(transaction)).toContain("compounded_medication_disclosure");
    expect(JSON.stringify(transaction)).not.toContain("platform_terms");
    expect(JSON.stringify(transaction)).not.toContain("telehealth_consent");
    expect(JSON.stringify(transaction)).not.toMatch(/answer|diagnosis|symptom/i);
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

function acceptedAcks(requiredConsents = currentRequiredConsents) {
  return Object.fromEntries(
    requiredConsents.map((consent) => [
      consentAcknowledgementFieldName(consent),
      "accepted",
    ]),
  );
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}
