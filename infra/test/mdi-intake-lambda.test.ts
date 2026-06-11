import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import questionnaireFlow from "../../tests/fixtures/mdi/questionnaire-flow.json";
import type { MdiIntakeGateway } from "../../src/lib/mdi-intake";

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

const questionnaire = questionnaireFlow.questionnaire;

describe("MDI intake lambda handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    verifyMock.mockReset();
    process.env.APP_TABLE_NAME = "apoth-staging-app";
    process.env.APOTH_ALLOWED_ORIGIN = "http://localhost:3000";
    process.env.APOTH_ALLOWED_ORIGINS = "http://localhost:3000,https://static.example.cloudfront.net";
    process.env.APOTH_MDI_QUESTIONNAIRE_ID = questionnaire.questionnaireId;
    process.env.APOTH_SECRET_MDI_API_ID = "/apoth/staging/mdi/api";
    process.env.APOTH_STAGE = "staging";
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTKEY";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
    verifyMock.mockResolvedValue({ sub: "cognito-sub-mdi-intake-lambda" });
    vi.unstubAllGlobals();
  });

  it("bootstraps the questionnaire after cookie auth, consent, and precheck status", async () => {
    const { bootstrapHandler, configureMdiIntakeLambdaForTests } = await import("../src/lambda/mdi-intake.js");
    configureMdiIntakeLambdaForTests({ gateway: gateway() });
    mockProfileAndConsent("intake_ready", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await bootstrapHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      csrfToken: csrfFor("valid-token"),
      status: "ready",
      questionnaire: {
        questionnaireId: questionnaire.questionnaireId,
        questions: expect.arrayContaining([
          expect.objectContaining({
            text: "QUESTION_TEXT_SENTINEL",
          }),
        ]),
      },
    });
    expect(sendMock.mock.calls.every(([command]) => command.kind === "GetItem"))
      .toBe(true);
  });

  it("returns submitted status from DynamoDB pointers without loading questions", async () => {
    const { bootstrapHandler, configureMdiIntakeLambdaForTests } = await import("../src/lambda/mdi-intake.js");
    const loadQuestionnaire = vi.fn();
    configureMdiIntakeLambdaForTests({
      gateway: gateway({ loadQuestionnaire }),
    });
    mockProfileAndConsent("mdi_submitted", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await bootstrapHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "submitted",
      linkage: {
        mdiPatientId: questionnaire.patientId,
        mdiCaseId: questionnaire.caseId,
      },
    });
    expect(loadQuestionnaire).not.toHaveBeenCalled();
  });

  it("uses the production MDI gateway when no test gateway is injected", async () => {
    const { bootstrapHandler } = await import("../src/lambda/mdi-intake.js");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://secretsmanager.us-east-1.amazonaws.com/") {
        return jsonResponse({
          SecretString: JSON.stringify({
            apothStage: "staging",
            apiBaseUrl: "https://mdi.example.test",
            clientId: "client-id",
            clientSecret: "client-secret",
            schemaVersion: 1,
            secretKind: "mdiApi",
          }),
        });
      }
      if (url === "https://mdi.example.test/partner/auth/token") {
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return jsonResponse({
          access_token: "mdi_access_token_test",
          expires_in: 300,
        });
      }
      if (
        url ===
          `https://mdi.example.test/partner/questionnaires/${encodeURIComponent(questionnaire.questionnaireId)}/questions`
      ) {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mdi_access_token_test",
        });
        return jsonResponse({ questions: questionnaire.questions });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    mockProfileAndConsent("intake_ready", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await bootstrapHandler(event());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "ready",
      questionnaire: {
        caseId: questionnaire.caseId,
        patientId: questionnaire.patientId,
        questionnaireId: questionnaire.questionnaireId,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects bad origin and csrf before reading or writing DynamoDB", async () => {
    const { submitHandler } = await import("../src/lambda/mdi-intake.js");

    await expect(submitHandler(event({
      headers: {
        origin: "https://evil.example",
      },
    }))).resolves.toMatchObject({
      statusCode: 403,
    });
    expect(sendMock).not.toHaveBeenCalled();

    await expect(submitHandler(event({
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
    }))).resolves.toMatchObject({
      statusCode: 403,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("submits transient answers to MDI and writes only pointer records to DynamoDB", async () => {
    const { submitHandler, configureMdiIntakeLambdaForTests } = await import("../src/lambda/mdi-intake.js");
    const submitResponses = vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: input.patientId,
          mdiCaseId: input.caseId,
        },
        submissionId: "mdi_submission_opaque_001",
      },
    }));
    configureMdiIntakeLambdaForTests({
      gateway: gateway({ submitResponses }),
    });
    mockProfileAndConsent("intake_ready", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await submitHandler(event({
      body: JSON.stringify({
        caseId: questionnaire.caseId,
        patientId: questionnaire.patientId,
        questionnaireId: questionnaire.questionnaireId,
        responses: [
          {
            questionId: questionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("valid-token"),
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(submitResponses.mock.calls)).toContain("ANSWER_VALUE_SENTINEL");
    expect(submitResponses.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: expect.stringMatching(/^mdi-intake-[a-f0-9]{32}$/),
    });
    const claim = sendMock.mock.calls.find(([command]) => command.kind === "PutItem")
      ?.[0].input;
    expect(JSON.stringify(claim)).toContain("mdiIntakeSubmissionClaim");
    expect(JSON.stringify(claim)).toContain("mdi-intake-");
    expect(JSON.stringify(claim)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(claim)).not.toContain("QUESTION_TEXT_SENTINEL");
    const transaction = sendMock.mock.calls.find(([command]) =>
      command.kind === "TransactWriteItems"
    )?.[0].input;
    expect(JSON.stringify(transaction)).toContain(questionnaire.patientId);
    expect(JSON.stringify(transaction)).toContain(questionnaire.caseId);
    expect(JSON.stringify(transaction)).toContain("mdi_submitted");
    expect(JSON.stringify(transaction)).not.toContain("mdiReverseLookup");
    expect(JSON.stringify(transaction)).not.toContain("MDI#PATIENT");
    expect(JSON.stringify(transaction)).not.toContain("MDI#CASE");
    expect(JSON.stringify(transaction)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(transaction)).not.toContain("QUESTION_TEXT_SENTINEL");
  });

  it("rejects ambiguous production submit responses before saving submitted status", async () => {
    const { submitHandler } = await import("../src/lambda/mdi-intake.js");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://secretsmanager.us-east-1.amazonaws.com/") {
        return jsonResponse({
          SecretString: JSON.stringify({
            apothStage: "staging",
            apiBaseUrl: "https://mdi.example.test",
            clientId: "client-id",
            clientSecret: "client-secret",
            schemaVersion: 1,
            secretKind: "mdiApi",
          }),
        });
      }
      if (url === "https://mdi.example.test/partner/auth/token") {
        return jsonResponse({
          access_token: "mdi_access_token_test",
          expires_in: 300,
        });
      }
      if (
        url ===
          `https://mdi.example.test/partner/questionnaires/${encodeURIComponent(questionnaire.questionnaireId)}/responses`
      ) {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mdi_access_token_test",
          "idempotency-key": expect.stringMatching(/^mdi-intake-[a-f0-9]{32}$/),
        });
        expect(String(init?.body)).toContain("ANSWER_VALUE_SENTINEL");
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    mockProfileAndConsent("intake_ready", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await submitHandler(event({
      body: JSON.stringify({
        caseId: questionnaire.caseId,
        patientId: questionnaire.patientId,
        questionnaireId: questionnaire.questionnaireId,
        responses: [
          {
            questionId: questionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("valid-token"),
      },
    }));

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({ code: "provider_unavailable" });
    expect(sendMock.mock.calls.some(([command]) => command.kind === "TransactWriteItems"))
      .toBe(false);
    expect(response.body).not.toContain("ANSWER_VALUE_SENTINEL");
  });

  it("rejects tampered questionnaire IDs before claiming submission", async () => {
    const { submitHandler, configureMdiIntakeLambdaForTests } = await import("../src/lambda/mdi-intake.js");
    const submitResponses = vi.fn();
    configureMdiIntakeLambdaForTests({
      gateway: gateway({ submitResponses }),
    });
    mockProfileAndConsent("intake_ready", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await submitHandler(event({
      body: JSON.stringify({
        caseId: questionnaire.caseId,
        patientId: questionnaire.patientId,
        questionnaireId: "mdi_questionnaire_tampered",
        responses: [
          {
            questionId: questionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("valid-token"),
      },
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ code: "invalid_input" });
    expect(sendMock.mock.calls.every(([command]) => command.kind === "GetItem"))
      .toBe(true);
    expect(sendMock.mock.calls.some(([command]) => command.kind === "PutItem"))
      .toBe(false);
    expect(submitResponses).not.toHaveBeenCalled();
    expect(response.body).not.toContain("ANSWER_VALUE_SENTINEL");
  });

  it("keeps provider errors bounded and answer-free", async () => {
    const { submitHandler, configureMdiIntakeLambdaForTests } = await import("../src/lambda/mdi-intake.js");
    configureMdiIntakeLambdaForTests({
      gateway: gateway({
        submitResponses: vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "provider_unavailable" as const,
            message: "MDI upstream unavailable",
            retryable: true,
            status: 503,
          },
        })),
      }),
    });
    mockProfileAndConsent("intake_ready", {
      mdiPatientId: questionnaire.patientId,
      mdiCaseId: questionnaire.caseId,
    });

    const response = await submitHandler(event({
      body: JSON.stringify({
        caseId: questionnaire.caseId,
        patientId: questionnaire.patientId,
        questionnaireId: questionnaire.questionnaireId,
        responses: [
          {
            questionId: questionnaire.questions[0].questionId,
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("valid-token"),
      },
    }));

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      code: "provider_unavailable",
    });
    expect(response.body).not.toContain("ANSWER_VALUE_SENTINEL");
  });
});

function mockProfileAndConsent(
  onboardingStatus: string,
  linkage?: { mdiPatientId: string; mdiCaseId?: string },
) {
  sendMock.mockImplementation(async (command) => {
    const input = command.input as {
      Key?: { sk?: { S?: string } };
    };
    if (command.kind === "GetItem" && input.Key?.sk?.S === "PROFILE") {
      return {
        Item: {
          onboardingStatus: { S: onboardingStatus },
          recordType: { S: "patientProfile" },
        },
      };
    }
    if (command.kind === "GetItem" && input.Key?.sk?.S === "MDI#LINKAGE") {
      return linkage
        ? {
          Item: {
            mdiCaseId: linkage.mdiCaseId ? { S: linkage.mdiCaseId } : undefined,
            mdiPatientId: { S: linkage.mdiPatientId },
            recordType: { S: "mdiLinkage" },
          },
        }
        : {};
    }
    if (command.kind === "GetItem") {
      return { Item: { recordType: { S: "consentEvidence" } } };
    }
    return {};
  });
}

function gateway(overrides: Partial<MdiIntakeGateway> = {}): MdiIntakeGateway {
  return {
    loadQuestionnaire: vi.fn(async () => ({
      ok: true as const,
      value: questionnaire,
    })),
    submitResponses: vi.fn(async (input) => ({
      ok: true as const,
      value: {
        linkage: {
          mdiPatientId: input.patientId,
          mdiCaseId: input.caseId,
        },
      },
    })),
    ...overrides,
  };
}

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

function csrfFor(token: string) {
  return createHash("sha256")
    .update(`mdi-intake:${token}`)
    .digest("base64url");
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
