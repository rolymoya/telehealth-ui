import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import {
  createEnrollmentRecord,
  createOtpTransactionRecord,
} from "@/lib/enrollment/records";
import {
  createDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "@/lib/enrollment/dynamodb-repository";

const now = "2026-07-29T01:00:00.000Z";

describe("DynamoDB enrollment repository", () => {
  it("resolves the existing stage app table without requiring static credentials", () => {
    expect(resolveDynamoDbEnrollmentConfig({
      APOTH_STAGE: "staging",
      AWS_REGION: "us-east-1",
    })).toEqual({
      ok: true,
      value: {
        endpoint: undefined,
        region: "us-east-1",
        tableName: "apoth-staging-app",
      },
    });
  });

  it("creates enrollment records with an exact-key conditional put", async () => {
    const send = vi.fn().mockResolvedValue({});
    const repository = createDynamoDbEnrollmentRepository({
      client: { send },
      tableName: "apoth-staging-app",
    });
    const record = createEnrollmentRecord({
      attemptBindingHash: "binding_hash_opaque_001",
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now,
    });

    expect(await repository.createEnrollment(record)).toEqual({
      ok: true,
      value: record,
    });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toEqual({
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      Item: record,
      TableName: "apoth-staging-app",
    });
  });

  it("reads enrollments consistently without a scan", async () => {
    const record = createEnrollmentRecord({
      attemptBindingHash: "binding_hash_opaque_001",
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now,
    });
    const send = vi.fn().mockResolvedValue({ Item: record });
    const repository = createDynamoDbEnrollmentRepository({
      client: { send },
      tableName: "apoth-staging-app",
    });

    expect(await repository.getEnrollment(record.enrollmentId)).toEqual({
      ok: true,
      value: record,
    });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      ConsistentRead: true,
      Key: { pk: record.pk, sk: record.sk },
      TableName: "apoth-staging-app",
    });
  });

  it("conditionally consumes a mode-bound OTP transaction by version", async () => {
    const transaction = createOtpTransactionRecord({
      challengeCorrelationHash: "challenge_hash_opaque_001",
      cognitoUsername: "cognito_username_opaque_001",
      emailFingerprint: "email_hmac_v1_opaque_001",
      emailFingerprintKeyVersion: 1,
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      mode: "enrollment_verification",
      now,
      stripeCheckoutSessionId: "cs_opaque_001",
      stripeCustomerId: "cus_opaque_001",
      transactionDigest: "otp_digest_opaque_001",
    });
    const send = vi.fn()
      .mockResolvedValueOnce({ Item: transaction })
      .mockResolvedValueOnce({});
    const repository = createDynamoDbEnrollmentRepository({
      client: { send },
      tableName: "apoth-staging-app",
    });

    const result = await repository.consumeOtpTransaction({
      consumedAt: "2026-07-29T01:02:00.000Z",
      expectedMode: "enrollment_verification",
      nowEpochSeconds: 1_800_000_100,
      transactionDigest: transaction.transactionDigest,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { state: "consumed", version: 2 },
    });
    const put = send.mock.calls[1][0];
    expect(put).toBeInstanceOf(PutCommand);
    expect(put.input).toMatchObject({
      ConditionExpression: "#version = :expectedVersion",
      ExpressionAttributeNames: { "#version": "version" },
      ExpressionAttributeValues: { ":expectedVersion": 1 },
      TableName: "apoth-staging-app",
    });
  });

  it("maps DynamoDB conditional failures without exposing record data", async () => {
    const error = Object.assign(new Error("conditional request failed"), {
      name: "ConditionalCheckFailedException",
    });
    const send = vi.fn().mockRejectedValue(error);
    const repository = createDynamoDbEnrollmentRepository({
      client: { send },
      tableName: "apoth-staging-app",
    });
    const record = createEnrollmentRecord({
      attemptBindingHash: "binding_hash_opaque_001",
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now,
    });

    expect(await repository.createEnrollment(record)).toEqual({
      ok: false,
      error: {
        code: "conditional_conflict",
        message: "DynamoDB enrollment condition was not satisfied",
      },
    });
  });
});
