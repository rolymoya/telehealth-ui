import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consentAcknowledgementFieldName,
  requiredConsentsForPrecheck,
} from "../../shared/consents";
import { anonymousPrecheckContextCookieName } from "../../shared/intake/anonymous-precheck-context";

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
    process.env.APOTH_ALLOW_ENV_SECRET_PAYLOADS = "true";
    process.env.APOTH_REQUIRED_SERVER_SECRETS = "appSigning";
    process.env.APOTH_SECRET_APP_SIGNING_JSON = JSON.stringify({
      apothStage: "staging",
      schemaVersion: 1,
      secretKind: "appSigning",
      signingSecret: "lambda-intake-signing-secret",
    });
    process.env.APOTH_STAGE = "staging";
    process.env.COGNITO_USER_POOL_CLIENT_ID = "client123456789012";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc123";
    verifyMock.mockResolvedValue({ sub: "cognito-sub-intake-lambda" });
  });

  it("mints a privacy notice gate cookie without DynamoDB access", async () => {
    const { privacyNoticeHandler } = await import("../src/lambda/intake.js");

    const response = await privacyNoticeHandler(event({
      body: JSON.stringify({
        acknowledgements: currentPrivacyNoticeAcknowledgements(),
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      omitDefaultCookie: true,
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "privacy_notice_accepted",
    });
    expect(response.cookies?.[0]).toContain("__Host-apoth_privacy_notice=");
    expect(response.cookies?.[0]).toContain("HttpOnly");
    expect(response.cookies?.[0]).toContain("Secure");
    expect(response.cookies?.[0]).toContain("SameSite=Lax");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects stale privacy notice acknowledgement without setting cookies", async () => {
    const { privacyNoticeHandler } = await import("../src/lambda/intake.js");

    const response = await privacyNoticeHandler(event({
      body: JSON.stringify({
        acknowledgements: {
          "consent:privacy_notice:old-version": "accepted",
        },
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      omitDefaultCookie: true,
    }));

    expect(response.statusCode).toBe(400);
    expect(response.cookies).toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
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

  it("anonymous precheck requires privacy evidence before DynamoDB writes", async () => {
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
      statusCode: 403,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("precheck does not downgrade invalid authenticated cookies to anonymous mode", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    verifyMock.mockRejectedValueOnce(new Error("invalid"));

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
    }))).resolves.toMatchObject({
      statusCode: 401,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("anonymous precheck writes only the short-lived context cookie", async () => {
    const { precheckHandler } = await import("../src/lambda/intake.js");
    const privacyCookie = await mintPrivacyNoticeCookie();

    const response = await precheckHandler(event({
      body: JSON.stringify({
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: " il ",
      }),
      headers: {
        cookie: privacyCookie,
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-apoth-csrf": csrfFor("intake-precheck", privacyCookieValue(privacyCookie)),
      },
      omitDefaultCookie: true,
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "ready_for_account_creation",
    });
    expect(response.body).not.toMatch(/weight|34|emergency|contraindication/i);
    expect(response.cookies?.[0]).toContain(`${anonymousPrecheckContextCookieName}=`);
    expect(response.cookies?.[0]).toContain("HttpOnly");
    expect(response.cookies?.[0]).toContain("Secure");
    expect(response.cookies?.[0]).toContain("Max-Age=1800");
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

function currentPrivacyNoticeAcknowledgements() {
  const privacyNotice = requiredConsentsForPrecheck().find((consent) =>
    consent.consentKind === "privacy_notice"
  );
  if (!privacyNotice) {
    throw new Error("Expected privacy notice consent");
  }
  return {
    [consentAcknowledgementFieldName(privacyNotice)]: "accepted",
  };
}

async function mintPrivacyNoticeCookie() {
  const { privacyNoticeHandler } = await import("../src/lambda/intake.js");
  const response = await privacyNoticeHandler(event({
    body: JSON.stringify({
      acknowledgements: currentPrivacyNoticeAcknowledgements(),
    }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    omitDefaultCookie: true,
  }));
  const cookie = response.cookies?.[0];
  if (!cookie) {
    throw new Error("Expected privacy notice cookie");
  }
  return cookie.split(";")[0];
}

function privacyCookieValue(cookie: string) {
  const [, value] = cookie.split("=");
  return decodeURIComponent(value ?? "");
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}
