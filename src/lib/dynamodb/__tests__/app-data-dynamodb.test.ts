import { describe, expect, it, vi } from "vitest";
import { patientProfileKey } from "@/lib/dynamodb/app-data";
import {
  createDynamoDbAppDataReadRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";

const now = new Date("2026-06-09T16:00:00.000Z");
const nowIso = now.toISOString();

describe("DynamoDB app-data read repository", () => {
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
});
