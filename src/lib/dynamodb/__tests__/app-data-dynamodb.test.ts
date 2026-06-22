import { describe, expect, it, vi } from "vitest";
import {
  createPatientProfileRecord,
  patientProfileKey,
  type MdiLinkageRecord,
  type MdiReverseLookupRecord,
} from "@/lib/dynamodb/app-data";
import { currentRequiredConsents } from "@/lib/consents";
import {
  createDynamoDbAppDataRepository,
  createDynamoDbAppDataReadRepository,
  linkMdiPatientCaseDynamoDb,
  linkStripeCustomerDynamoDb,
  recordCurrentConsentAcceptanceDynamoDb,
  recordConsentEvidenceDynamoDb,
  resolveDynamoDbAppDataConfig,
  upsertPatientProfileDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";

const now = new Date("2026-06-09T16:00:00.000Z");
const nowIso = now.toISOString();

describe("DynamoDB app-data repository", () => {
  it("resolves the launch table name and AWS credentials from server env", () => {
    expect(resolveDynamoDbAppDataConfig({
      APOTH_STAGE: "staging",
      AWS_ACCESS_KEY_ID: "access",
      AWS_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: "secret",
    })).toEqual({
      ok: true,
      value: {
        accessKeyId: "access",
        region: "us-east-1",
        secretAccessKey: "secret",
        tableName: "apoth-staging-app",
      },
    });
  });

  it("reads and validates app-data records through DynamoDB GetItem", async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      expect(JSON.parse(init.body)).toEqual({
        ConsistentRead: true,
        Key: {
          pk: { S: "PATIENT#cognito-sub-0123456789abcdef" },
          sk: { S: "PROFILE" },
        },
        TableName: "apoth-staging-app",
      });
      expect(init.headers["x-amz-target"]).toBe("DynamoDB_20120810.GetItem");
      expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256");

      return {
        async json() {
          return {
            Item: {
              cognitoSub: { S: "cognito-sub-0123456789abcdef" },
              createdAt: { S: nowIso },
              onboardingStatus: { S: "intake_ready" },
              pk: { S: "PATIENT#cognito-sub-0123456789abcdef" },
              recordType: { S: "patientProfile" },
              schemaVersion: { N: "1" },
              sk: { S: "PROFILE" },
              updatedAt: { S: nowIso },
            },
          };
        },
        ok: true,
        status: 200,
      };
    });

    const repository = createDynamoDbAppDataReadRepository({
      accessKeyId: "access",
      region: "us-east-1",
      secretAccessKey: "secret",
      tableName: "apoth-staging-app",
    }, {
      fetch: fetchMock,
      now: () => now,
    });

    await expect(
      repository.get(patientProfileKey("cognito-sub-0123456789abcdef")),
    ).resolves.toEqual({
      ok: true,
      value: {
        cognitoSub: "cognito-sub-0123456789abcdef",
        createdAt: nowIso,
        onboardingStatus: "intake_ready",
        pk: "PATIENT#cognito-sub-0123456789abcdef",
        recordType: "patientProfile",
        schemaVersion: 1,
        sk: "PROFILE",
        updatedAt: nowIso,
      },
    });
  });

  it("writes allowlisted profile records through signed DynamoDB PutItem", async () => {
    const requests: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      requests.push(JSON.parse(init.body));
      expect(init.headers["x-amz-target"]).toBe("DynamoDB_20120810.PutItem");
      expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256");
      return {
        async json() {
          return {};
        },
        ok: true,
        status: 200,
      };
    });
    const repository = createRepository(fetchMock);
    const profile = createPatientProfileRecord({
      cognitoSub: "cognito-sub-0123456789abcdef",
      onboardingStatus: "profile_pending",
      now: nowIso,
    });

    await expect(repository.put(profile, { ifNotExists: true })).resolves.toEqual({
      ok: true,
      value: profile,
    });
    expect(requests).toEqual([
      {
        ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        Item: {
          cognitoSub: { S: "cognito-sub-0123456789abcdef" },
          createdAt: { S: nowIso },
          onboardingStatus: { S: "profile_pending" },
          pk: { S: "PATIENT#cognito-sub-0123456789abcdef" },
          recordType: { S: "patientProfile" },
          schemaVersion: { N: "1" },
          sk: { S: "PROFILE" },
          updatedAt: { S: nowIso },
        },
        TableName: "apoth-staging-app",
      },
    ]);
    expect(JSON.stringify(requests)).not.toContain("answers");
    expect(JSON.stringify(requests)).not.toContain("diagnosis");
  });

  it("executes profile, consent, MDI, and Stripe helpers against the live adapter path", async () => {
    const targets: string[] = [];
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      targets.push(init.headers["x-amz-target"]);
      bodies.push(JSON.parse(init.body));
      return {
        async json() {
          return init.headers["x-amz-target"] === "DynamoDB_20120810.GetItem"
            ? {}
            : {};
        },
        ok: true,
        status: 200,
      };
    });
    const repository = createRepository(fetchMock);

    await expect(
      upsertPatientProfileDynamoDb(repository, {
        cognitoSub: "cognito-sub-0123456789abcdef",
        onboardingStatus: "profile_pending",
        now: nowIso,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        recordType: "patientProfile",
      },
    });
    await expect(
      recordConsentEvidenceDynamoDb(repository, {
        acceptedAt: nowIso,
        cognitoSub: "cognito-sub-0123456789abcdef",
        consentKind: currentRequiredConsents[0].consentKind,
        now: nowIso,
        version: currentRequiredConsents[0].version,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        recordType: "consentEvidence",
      },
    });
    await expect(
      linkMdiPatientCaseDynamoDb(repository, {
        cognitoSub: "cognito-sub-0123456789abcdef",
        mdiCaseId: "mdi_case_001",
        mdiPatientId: "mdi_patient_001",
        now: nowIso,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        recordType: "mdiLinkage",
      },
    });
    await expect(
      linkStripeCustomerDynamoDb(repository, {
        billingStatus: "payment_method_collected",
        cognitoSub: "cognito-sub-0123456789abcdef",
        now: nowIso,
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: "sub_opaque_001",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        recordType: "stripeLinkage",
      },
    });

    expect(targets).toContain("DynamoDB_20120810.GetItem");
    expect(targets).toContain("DynamoDB_20120810.PutItem");
    expect(targets).toContain("DynamoDB_20120810.TransactWriteItems");
    expect(JSON.stringify(bodies)).toContain("attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("answers");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("clinicalNotes");
  });

  it("blocks DynamoDB Stripe linkage downgrades outside allowed current statuses", async () => {
    const existingStripeLinkage = {
      billingStatus: { S: "active" },
      cognitoSub: { S: "cognito-sub-0123456789abcdef" },
      createdAt: { S: nowIso },
      pk: { S: "PATIENT#cognito-sub-0123456789abcdef" },
      recordType: { S: "stripeLinkage" },
      schemaVersion: { N: "1" },
      sk: { S: "STRIPE#LINKAGE" },
      stripeBillingStatusObservedAt: { S: nowIso },
      stripeCustomerId: { S: "cus_opaque_001" },
      stripeSubscriptionId: { S: "sub_opaque_001" },
      updatedAt: { S: nowIso },
    };
    const targets: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      targets.push(init.headers["x-amz-target"]);
      return {
        async json() {
          return { Item: existingStripeLinkage };
        },
        ok: true,
        status: 200,
      };
    });
    const repository = createRepository(fetchMock);

    await expect(
      linkStripeCustomerDynamoDb(repository, {
        allowedCurrentBillingStatuses: ["not_started", "payment_method_pending"],
        billingStatus: "payment_method_pending",
        cognitoSub: "cognito-sub-0123456789abcdef",
        now: "2026-06-09T16:05:00.000Z",
        stripeCustomerId: "cus_opaque_001",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "stale_transition",
        message: "Stripe linkage billing status changed before update",
      },
    });

    expect(targets).toEqual(["DynamoDB_20120810.GetItem"]);
  });

  it("records current consent acceptance through an idempotent DynamoDB transaction", async () => {
    const targets: string[] = [];
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      targets.push(init.headers["x-amz-target"]);
      bodies.push(JSON.parse(init.body));
      return {
        async json() {
          return {};
        },
        ok: true,
        status: 200,
      };
    });
    const repository = createRepository(fetchMock);

    await expect(
      recordCurrentConsentAcceptanceDynamoDb(repository, {
        acceptedAt: nowIso,
        cognitoSub: "cognito-sub-0123456789abcdef",
        now: nowIso,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({
          consentKind: "platform_terms",
          recordType: "consentEvidence",
        }),
        expect.objectContaining({
          consentKind: "privacy_notice",
          recordType: "consentEvidence",
        }),
      ]),
    });

    expect(targets.filter((target) => target === "DynamoDB_20120810.GetItem"))
      .toHaveLength(currentRequiredConsents.length);
    expect(targets).toContain("DynamoDB_20120810.TransactWriteItems");
    expect(JSON.stringify(bodies)).toContain("CONSENT#platform_terms#");
    expect(JSON.stringify(bodies)).toContain("CONSENT#privacy_notice#");
    expect(JSON.stringify(bodies)).toContain("attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
    expect(JSON.stringify(bodies)).not.toContain("questionnaire");
    expect(JSON.stringify(bodies)).not.toContain("userAgent");
  });

  it("writes MDI linkage and reverse lookup records through DynamoDB transactions", async () => {
    const requests: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      requests.push(JSON.parse(init.body));
      expect(init.headers["x-amz-target"]).toBe("DynamoDB_20120810.TransactWriteItems");
      return {
        async json() {
          return {};
        },
        ok: true,
        status: 200,
      };
    });
    const repository = createRepository(fetchMock);
    const linkage: MdiLinkageRecord = {
      cognitoSub: "cognito-sub-0123456789abcdef",
      createdAt: nowIso,
      mdiCaseId: "mdi_case_001",
      mdiPatientId: "mdi_patient_001",
      pk: "PATIENT#cognito-sub-0123456789abcdef",
      recordType: "mdiLinkage",
      schemaVersion: 1,
      sk: "MDI#LINKAGE",
      updatedAt: nowIso,
    };
    const reverse: MdiReverseLookupRecord = {
      cognitoSub: "cognito-sub-0123456789abcdef",
      createdAt: nowIso,
      mdiPatientId: "mdi_patient_001",
      pk: "MDI#PATIENT#mdi_patient_001",
      pointerType: "patient",
      recordType: "mdiReverseLookup",
      schemaVersion: 1,
      sk: "PATIENT",
      updatedAt: nowIso,
    };

    await expect(repository.transactWrite([
      { type: "put", record: linkage },
      { type: "put", record: reverse, ifNotExists: true },
      { type: "delete", key: { pk: "MDI#PATIENT#mdi_patient_old", sk: "PATIENT" } },
    ])).resolves.toEqual({ ok: true, value: undefined });

    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0])).toContain("TransactItems");
    expect(JSON.stringify(requests[0])).toContain("MDI#LINKAGE");
    expect(JSON.stringify(requests[0])).toContain("attribute_not_exists");
    expect(JSON.stringify(requests[0])).not.toContain("questionnaire");
    expect(JSON.stringify(requests[0])).not.toContain("clinicalNotes");
  });

  it("conditions existing linkage replacements and stale reverse deletes", async () => {
    const existingLinkage = {
      cognitoSub: { S: "cognito-sub-0123456789abcdef" },
      createdAt: { S: nowIso },
      mdiCaseId: { S: "mdi_case_old" },
      mdiPatientId: { S: "mdi_patient_old" },
      pk: { S: "PATIENT#cognito-sub-0123456789abcdef" },
      recordType: { S: "mdiLinkage" },
      schemaVersion: { N: "1" },
      sk: { S: "MDI#LINKAGE" },
      updatedAt: { S: nowIso },
    };
    const oldPatientReverse = {
      cognitoSub: { S: "cognito-sub-0123456789abcdef" },
      createdAt: { S: nowIso },
      mdiPatientId: { S: "mdi_patient_old" },
      pk: { S: "MDI#PATIENT#mdi_patient_old" },
      pointerType: { S: "patient" },
      recordType: { S: "mdiReverseLookup" },
      schemaVersion: { N: "1" },
      sk: { S: "PATIENT" },
      updatedAt: { S: nowIso },
    };
    const oldCaseReverse = {
      cognitoSub: { S: "cognito-sub-0123456789abcdef" },
      createdAt: { S: nowIso },
      mdiCaseId: { S: "mdi_case_old" },
      pk: { S: "MDI#CASE#mdi_case_old" },
      pointerType: { S: "case" },
      recordType: { S: "mdiReverseLookup" },
      schemaVersion: { N: "1" },
      sk: { S: "PATIENT" },
      updatedAt: { S: nowIso },
    };
    const responses = [
      { Item: existingLinkage },
      {},
      {},
      { Item: oldPatientReverse },
      { Item: oldCaseReverse },
      {},
    ];
    const requests: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const next = responses.shift() ?? {};
      return {
        async json() {
          return next;
        },
        ok: true,
        status: 200,
      };
    });
    const repository = createRepository(fetchMock);

    await expect(
      linkMdiPatientCaseDynamoDb(repository, {
        cognitoSub: "cognito-sub-0123456789abcdef",
        mdiCaseId: "mdi_case_new",
        mdiPatientId: "mdi_patient_new",
        now: "2026-06-09T16:05:00.000Z",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        mdiCaseId: "mdi_case_new",
        mdiPatientId: "mdi_patient_new",
      },
    });

    const transaction = requests.at(-1);
    expect(JSON.stringify(transaction)).toContain("TransactItems");
    expect(JSON.stringify(transaction)).toContain("#f0 = :v0");
    expect(JSON.stringify(transaction)).toContain("MDI#PATIENT#mdi_patient_old");
    expect(JSON.stringify(transaction)).toContain("MDI#CASE#mdi_case_old");
  });

  it("maps conditional DynamoDB write failures to conditional conflicts", async () => {
    const fetchMock = vi.fn(async () => ({
      async json() {
        return { __type: "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException" };
      },
      ok: false,
      status: 400,
    }));
    const repository = createRepository(fetchMock);

    await expect(
      repository.put(createPatientProfileRecord({
        cognitoSub: "cognito-sub-0123456789abcdef",
        onboardingStatus: "profile_pending",
        now: nowIso,
      }), { ifNotExists: true }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "conditional_conflict",
        message: "DynamoDB PutItem failed with 400",
      },
    });
  });
});

type RepositoryOptions = NonNullable<Parameters<typeof createDynamoDbAppDataRepository>[1]>;

function createRepository(fetchMock: RepositoryOptions["fetch"]) {
  return createDynamoDbAppDataRepository({
    accessKeyId: "access",
    region: "us-east-1",
    secretAccessKey: "secret",
    tableName: "apoth-staging-app",
  }, {
    fetch: fetchMock,
    now: () => now,
  });
}
