import { createHash } from "node:crypto";
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

describe("intake lambda handlers", () => {
  beforeEach(() => {
    sendMock.mockReset();
    verifyMock.mockReset();
    process.env.APP_TABLE_NAME = "apoth-staging-app";
    process.env.APOTH_ALLOWED_ORIGIN = "http://localhost:3000";
    process.env.APOTH_ALLOWED_ORIGINS = "http://localhost:3000,https://static.example.cloudfront.net";
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
    verifyMock.mockResolvedValue({ sub: "cognito-sub-intake-lambda" });
  });

  it("bootstrap verifies cookie and consent, performs no writes, and returns csrf tokens", async () => {
    const { bootstrapHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      return input.Key?.sk?.S === "PROFILE" || input.Key?.sk?.S === "MDI#LINKAGE"
        ? {}
        : { Item: { recordType: { S: "consentEvidence" } } };
    });

    const response = await bootstrapHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      csrfToken: csrfFor("intake-precheck", "valid-token"),
      mdiPatientCsrfToken: csrfFor("mdi-patient", "valid-token"),
      mdiPatientLinked: false,
      status: "ready_for_precheck",
    });
    expect(sendMock.mock.calls.every(([command]) => command.kind === "GetItem"))
      .toBe(true);
  });

  it("bootstrap reports when an MDI patient linkage already exists", async () => {
    const { bootstrapHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      if (input.Key?.sk?.S === "PROFILE") {
        return {
          Item: {
            onboardingStatus: { S: "intake_ready" },
            recordType: { S: "patientProfile" },
            residencyState: { S: "IL" },
          },
        };
      }
      if (input.Key?.sk?.S === "MDI#LINKAGE") {
        return {
          Item: {
            mdiPatientId: { S: "mdi_patient_123" },
            recordType: { S: "mdiLinkage" },
          },
        };
      }
      return { Item: { recordType: { S: "consentEvidence" } } };
    });

    const response = await bootstrapHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      mdiPatientLinked: true,
      profile: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });
  });

  it("bootstrap accepts HTTP API v2 cookie arrays", async () => {
    const { bootstrapHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      return input.Key?.sk?.S === "PROFILE" || input.Key?.sk?.S === "MDI#LINKAGE"
        ? {}
        : { Item: { recordType: { S: "consentEvidence" } } };
    });

    const response = await bootstrapHandler(event({
      cookies: ["other=value", "__Host-apoth_access=valid-token"],
      headers: {},
      omitDefaultCookie: true,
    }));

    expect(response.statusCode).toBe(200);
    expect(verifyMock).toHaveBeenCalledWith("valid-token");
  });

  it("precheck rejects bad origin and missing csrf before DynamoDB writes", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");

    await expect(precheckHandler(event({
      headers: {
        origin: "https://evil.example",
      },
    }))).resolves.toMatchObject({
      statusCode: 403,
    });
    expect(sendMock).not.toHaveBeenCalled();

    await expect(precheckHandler(event())).resolves.toMatchObject({
      statusCode: 403,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("precheck returns 401 for missing sessions before DynamoDB writes", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");

    await expect(precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
      omitDefaultCookie: true,
    }))).resolves.toMatchObject({
      statusCode: 401,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("bootstrap returns 401 for malformed cookie encoding without DynamoDB reads", async () => {
    const { bootstrapHandler } = await import("../src/lambda/intake.js");

    await expect(bootstrapHandler(event({
      headers: {
        cookie: "__Host-apoth_access=%E0%A4%A",
      },
    }))).resolves.toMatchObject({
      statusCode: 401,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("precheck requires current consent before screening submitted answers", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async () => ({}));

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "17",
        blockingContraindication: "no",
        emergencySymptoms: "yes",
        offering: "weight",
        state: "IL",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
    }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      code: "consent_required",
    });
    expect(response.body).not.toContain("under_18");
    expect(response.body).not.toContain("emergency_symptoms");
    expect(sendMock.mock.calls.every(([command]) => command.kind === "GetItem"))
      .toBe(true);
  });

  it("precheck writes only the minimal profile update after auth, consent, and csrf pass", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        return {
          Item: {
            onboardingStatus: { S: "profile_pending" },
            recordType: { S: "patientProfile" },
          },
        };
      }
      if (command.kind === "GetItem") {
        return { Item: { recordType: { S: "consentEvidence" } } };
      }
      return {};
    });

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: " il ",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      mdiPatientCsrfToken: csrfFor("mdi-patient", "valid-token"),
    });
    const update = sendMock.mock.calls.find(([command]) =>
      command.kind === "UpdateItem"
    )?.[0].input as {
      ExpressionAttributeValues: Record<string, { S: string }>;
    };
    expect(update.ExpressionAttributeValues[":residencyState"]).toEqual({ S: "IL" });
    expect(JSON.stringify(update)).not.toContain("weight");
    expect(JSON.stringify(update)).not.toContain("emergency");
  });

  it("precheck accepts the deployed static CloudFront origin", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        return {};
      }
      if (command.kind === "GetItem") {
        return { Item: { recordType: { S: "consentEvidence" } } };
      }
      return {};
    });

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      }),
      headers: {
        "content-type": "application/json",
        origin: "https://static.example.cloudfront.net",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
    }));

    expect(response.statusCode).toBe(200);
  });

  it("precheck conflicts instead of overwriting a concurrently filled residency state", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    let profileReads = 0;
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        profileReads += 1;
        return {
          Item: {
            onboardingStatus: { S: "intake_ready" },
            recordType: { S: "patientProfile" },
            ...(profileReads > 1 ? { residencyState: { S: "CA" } } : {}),
          },
        };
      }
      if (command.kind === "GetItem") {
        return { Item: { recordType: { S: "consentEvidence" } } };
      }
      throw namedError("ConditionalCheckFailedException");
    });

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
    }));

    expect(response.statusCode).toBe(409);
    const update = sendMock.mock.calls.find(([command]) =>
      command.kind === "UpdateItem"
    )?.[0].input as {
      ConditionExpression: string;
    };
    expect(update.ConditionExpression).toContain("attribute_not_exists(#residencyState)");
  });

  it("precheck returns a bounded server error for non-conditional profile write failures", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    sendMock.mockImplementation(async (command) => {
      const input = command.input as {
        Key?: { sk?: { S?: string } };
      };
      if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
        return {
          Item: {
            onboardingStatus: { S: "profile_pending" },
            recordType: { S: "patientProfile" },
          },
        };
      }
      if (command.kind === "GetItem") {
        return { Item: { recordType: { S: "consentEvidence" } } };
      }
      throw namedError("AccessDeniedException");
    });

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
    }));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      code: "profile_update_failed",
    });
  });

  it("precheck returns non-success for clinician-review outcomes before DynamoDB writes", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    sendMock.mockResolvedValue({ Item: { recordType: { S: "consentEvidence" } } });

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "yes",
        offering: "weight",
        state: "IL",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", "valid-token"),
      },
    }));

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      code: "emergency_symptoms",
      outcome: "needs_clinician_review",
    });
    expect(sendMock.mock.calls.every(([command]) => command.kind === "GetItem"))
      .toBe(true);
  });
});

function event(overrides: {
  body?: string;
  cookies?: string[];
  headers?: Record<string, string>;
  omitDefaultCookie?: boolean;
} = {}) {
  return {
    body: overrides.body,
    cookies: overrides.cookies,
    headers: overrides.omitDefaultCookie
      ? overrides.headers ?? {}
      : {
          cookie: "__Host-apoth_access=valid-token",
          ...overrides.headers,
        },
  };
}

function csrfFor(scope: "intake-precheck" | "mdi-patient", token: string) {
  return createHash("sha256")
    .update(`${scope}:${token}`)
    .digest("base64url");
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}
