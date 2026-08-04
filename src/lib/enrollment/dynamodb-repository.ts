import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { OtpVerificationMode } from "@/lib/enrollment/contracts";
import {
  accountEnrollmentKey,
  accountEnrollmentPointerKey,
  emailClaimKey,
  enrollmentKey,
  externalOperationKey,
  launchNonceKey,
  otpTransactionKey,
  portalLinkageKey,
  stripeCustomerClaimKey,
  validateEnrollmentPersistenceRecord,
  type EnrollmentPersistenceKey,
  type EnrollmentPersistenceRecord,
  type EnrollmentRecord,
  type ExternalOperationRecord,
  type LaunchNonceRecord,
  type OtpTransactionRecord,
} from "@/lib/enrollment/records";
import type {
  EnrollmentRepository,
  EnrollmentRepositoryErrorCode,
  EnrollmentRepositoryResult,
} from "@/lib/enrollment/repository";
import { bindingClaims } from "@/lib/enrollment/repository";
import { applyEnrollmentTransition } from "@/lib/enrollment/state-machine";

type DynamoDbEnrollmentClient = {
  send(command: GetCommand | PutCommand | TransactWriteCommand): Promise<unknown>;
};

export type DynamoDbEnrollmentConfig = {
  endpoint?: string;
  region: string;
  tableName: string;
};

export function resolveDynamoDbEnrollmentConfig(
  env: Record<string, string | undefined>,
): EnrollmentRepositoryResult<DynamoDbEnrollmentConfig> {
  const stage = cleanEnv(env.APOTH_STAGE);
  const tableName = cleanEnv(env.APP_TABLE_NAME) ??
    cleanEnv(env.APOTH_APP_TABLE_NAME) ??
    (stage ? `apoth-${stage}-app` : undefined);
  const region = cleanEnv(env.AWS_REGION) ?? cleanEnv(env.AWS_DEFAULT_REGION);
  if (!tableName || !region) {
    return err(
      "validation_failed",
      "DynamoDB enrollment table name and region are required",
    );
  }
  return ok({
    endpoint: cleanEnv(env.APOTH_DYNAMODB_ENDPOINT),
    region,
    tableName,
  });
}

export function createDefaultDynamoDbEnrollmentRepository(
  config: DynamoDbEnrollmentConfig,
): EnrollmentRepository {
  const baseClient = new DynamoDBClient({
    endpoint: config.endpoint,
    region: config.region,
  });
  const client = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return createDynamoDbEnrollmentRepository({
    client: client as unknown as DynamoDbEnrollmentClient,
    tableName: config.tableName,
  });
}

export function createDynamoDbEnrollmentRepository(input: {
  client: DynamoDbEnrollmentClient;
  tableName: string;
}): EnrollmentRepository {
  return {
    async beginOtpVerification(verificationInput) {
      const current = await getRecord(
        input,
        enrollmentKey(verificationInput.enrollmentId),
      );
      if (!current.ok) {
        return current;
      }
      if (!current.value || current.value.recordType !== "enrollment") {
        return err("not_found", "Enrollment is unavailable for verification");
      }
      const enrollment = current.value;
      if (
        enrollment.checkout !== "completed" ||
        enrollment.paymentSetup !== "setup_succeeded" ||
        verificationInput.transaction.enrollmentId !== enrollment.enrollmentId ||
        verificationInput.transaction.stripeCustomerId !== enrollment.stripeCustomerId ||
        verificationInput.transaction.stripeCheckoutSessionId !== enrollment.stripeCheckoutSessionId
      ) {
        return err("conditional_conflict", "Enrollment cannot begin this OTP verification");
      }
      const transitioned = applyEnrollmentTransition(enrollment, {
        changes: { identity: "verification_pending" },
      });
      if (!transitioned.ok) {
        return err("conditional_conflict", transitioned.error.message);
      }
      const updated = {
        ...enrollment,
        ...transitioned.value,
        updatedAt: verificationInput.now,
        version: enrollment.version + 1,
      };
      try {
        await input.client.send(new TransactWriteCommand({
          TransactItems: [
            expectedPut(input.tableName, updated, enrollment.version),
            newPut(input.tableName, verificationInput.transaction),
          ],
        }));
        return ok({
          enrollment: updated,
          transaction: verificationInput.transaction,
        });
      } catch (error) {
        return dynamoError(error);
      }
    },

    async bindVerifiedEnrollment(bindingInput) {
      const enrollmentResult = await getRecord(
        input,
        enrollmentKey(bindingInput.enrollmentId),
      );
      const transactionResult = await getRecord(
        input,
        otpTransactionKey(bindingInput.transactionDigest),
      );
      if (!enrollmentResult.ok) {
        return enrollmentResult;
      }
      if (!transactionResult.ok) {
        return transactionResult;
      }
      if (!enrollmentResult.value || enrollmentResult.value.recordType !== "enrollment" ||
          !transactionResult.value || transactionResult.value.recordType !== "otpTransaction") {
        return err("not_found", "Enrollment verification transaction is unavailable");
      }
      const previousEnrollment = enrollmentResult.value;
      const previousTransaction = transactionResult.value;
      const claims = bindingClaims(
        previousEnrollment,
        previousTransaction,
        bindingInput,
      );
      if (!claims.ok) {
        return claims;
      }

      if (previousEnrollment.identity === "verified" && previousTransaction.state === "consumed") {
        const existingClaims = await Promise.all([
          getRecord(input, emailClaimKey(claims.value.emailClaim.emailFingerprint)),
          getRecord(input, stripeCustomerClaimKey(claims.value.stripeCustomerClaim.stripeCustomerId)),
          getRecord(input, accountEnrollmentKey(
            claims.value.accountEnrollment.cognitoSub,
            claims.value.accountEnrollment.enrollmentId,
          )),
          getRecord(
            input,
            accountEnrollmentPointerKey(claims.value.accountEnrollmentPointer.cognitoSub),
          ),
        ]);
        if (existingClaims.some((result) => !result.ok || !result.value)) {
          return err("conditional_conflict", "Verified enrollment linkage is incomplete");
        }
        return claims;
      }

      try {
        await input.client.send(new TransactWriteCommand({
          TransactItems: [
            expectedPut(input.tableName, claims.value.enrollment, previousEnrollment.version),
            expectedPut(input.tableName, claims.value.otpTransaction, previousTransaction.version),
            ownedPut(input.tableName, claims.value.emailClaim, bindingInput.cognitoSub),
            newPut(input.tableName, claims.value.stripeCustomerClaim),
            newPut(input.tableName, claims.value.accountEnrollment),
            ownedPut(
              input.tableName,
              claims.value.accountEnrollmentPointer,
              bindingInput.cognitoSub,
            ),
            {
              ConditionCheck: {
                ConditionExpression: "attribute_not_exists(#pk) OR #cognitoSub = :cognitoSub",
                ExpressionAttributeNames: {
                  "#pk": "pk",
                  "#cognitoSub": "cognitoSub",
                },
                ExpressionAttributeValues: {
                  ":cognitoSub": bindingInput.cognitoSub,
                },
                Key: {
                  pk: `STRIPE#CUSTOMER#${claims.value.stripeCustomerClaim.stripeCustomerId}`,
                  sk: "PATIENT",
                },
                TableName: input.tableName,
              },
            },
          ],
        }));
        return claims;
      } catch (error) {
        return dynamoError(error);
      }
    },

    async createVerifiedEnrollmentBinding(bindingInput) {
      const enrollmentValidation = validateEnrollmentPersistenceRecord(
        bindingInput.enrollment,
      );
      const pointerValidation = validateEnrollmentPersistenceRecord(bindingInput.pointer);
      if (
        !enrollmentValidation.ok ||
        !pointerValidation.ok ||
        bindingInput.enrollment.identity !== "verified" ||
        bindingInput.enrollment.cognitoSub !== bindingInput.pointer.cognitoSub ||
        bindingInput.enrollment.enrollmentId !== bindingInput.pointer.enrollmentId ||
        bindingInput.enrollment.expiresAtEpochSeconds !== undefined
      ) {
        return err("validation_failed", "Verified enrollment binding is invalid");
      }
      try {
        await input.client.send(new TransactWriteCommand({
          TransactItems: [
            newPut(input.tableName, bindingInput.enrollment),
            newPut(input.tableName, bindingInput.pointer),
          ],
        }));
        return ok(bindingInput);
      } catch (error) {
        return dynamoError(error);
      }
    },

    async createCheckoutAttempt(attempt) {
      const enrollmentValidation = validateEnrollmentPersistenceRecord(attempt.enrollment);
      const operationValidation = validateEnrollmentPersistenceRecord(attempt.operation);
      if (!enrollmentValidation.ok || !operationValidation.ok) {
        return err(
          "validation_failed",
          enrollmentValidation.ok
            ? operationValidation.ok ? "Invalid checkout attempt" : operationValidation.error.message
            : enrollmentValidation.error.message,
        );
      }
      try {
        await input.client.send(new TransactWriteCommand({
          TransactItems: [attempt.enrollment, attempt.operation].map((record) => ({
            Put: {
              ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              Item: record,
              TableName: input.tableName,
            },
          })),
        }));
        return ok(attempt);
      } catch (error) {
        return dynamoError(error);
      }
    },

    createEnrollment: (record) => putNew(input, record),

    async getEnrollment(enrollmentId) {
      const result = await getRecord(input, enrollmentKey(enrollmentId));
      if (!result.ok) {
        return result;
      }
      if (result.value === null) {
        return ok(null);
      }
      return result.value.recordType === "enrollment"
        ? ok(result.value)
        : err("unexpected_client_failure", "Enrollment key returned an unexpected record type");
    },

    async updateEnrollment(record, expectedVersion) {
      if (record.version !== expectedVersion + 1) {
        return err("validation_failed", "Enrollment version must increment exactly once");
      }
      return putExpected(input, record, expectedVersion);
    },

    async getActiveAccountEnrollment(cognitoSub) {
      const result = await getRecord(input, accountEnrollmentPointerKey(cognitoSub));
      if (!result.ok) {
        return result;
      }
      if (result.value === null) {
        return ok(null);
      }
      return result.value.recordType === "accountEnrollmentPointer"
        ? ok(result.value)
        : err(
          "unexpected_client_failure",
          "Active enrollment key returned an unexpected record type",
        );
    },

    createPortalLinkage: (record) => putNew(input, record),

    async getPortalLinkage(cognitoSub) {
      const result = await getRecord(input, portalLinkageKey(cognitoSub));
      if (!result.ok) {
        return result;
      }
      if (result.value === null) {
        return ok(null);
      }
      return result.value.recordType === "portalLinkage"
        ? ok(result.value)
        : err(
          "unexpected_client_failure",
          "Portal linkage key returned an unexpected record type",
        );
    },

    createOtpTransaction: (record) => putNew(input, record),

    async getOtpTransaction(transactionDigest) {
      const result = await getRecord(input, otpTransactionKey(transactionDigest));
      if (!result.ok) {
        return result;
      }
      if (result.value === null) {
        return ok(null);
      }
      return result.value.recordType === "otpTransaction"
        ? ok(result.value)
        : err("unexpected_client_failure", "OTP transaction key returned an unexpected record type");
    },

    consumeOtpTransaction: (consumeInput) => mutateRecord(
      input,
      otpTransactionKey(consumeInput.transactionDigest),
      "otpTransaction",
      (record) => consumeOtp(record, consumeInput),
    ),

    createExternalOperation: (record) => putNew(input, record),

    async getExternalOperation(operationId) {
      const result = await getRecord(input, externalOperationKey(operationId));
      if (!result.ok) {
        return result;
      }
      if (result.value === null) {
        return ok(null);
      }
      return result.value.recordType === "externalOperation"
        ? ok(result.value)
        : err("unexpected_client_failure", "External operation key returned an unexpected record type");
    },

    leaseExternalOperation: (leaseInput) => mutateRecord(
      input,
      externalOperationKey(leaseInput.operationId),
      "externalOperation",
      (record) => leaseOperation(record, leaseInput),
    ),

    markExternalOperationRetryable: (failureInput) => mutateRecord(
      input,
      externalOperationKey(failureInput.operationId),
      "externalOperation",
      (record) => markOperationRetryable(record, failureInput),
    ),

    markExternalOperationSucceeded: (successInput) => mutateRecord(
      input,
      externalOperationKey(successInput.operationId),
      "externalOperation",
      (record) => markOperationSucceeded(record, successInput),
    ),

    createLaunchNonce: (record) => putNew(input, record),

    beginLaunchExchange: (exchangeInput) => mutateRecord(
      input,
      launchNonceKey(exchangeInput.nonceDigest),
      "launchNonce",
      (record) => beginExchange(record, exchangeInput),
    ),

    consumeLaunchNonce: (consumeInput) => mutateRecord(
      input,
      launchNonceKey(consumeInput.nonceDigest),
      "launchNonce",
      (record) => consumeNonce(record, consumeInput),
    ),
  };
}

function newPut(tableName: string, record: EnrollmentPersistenceRecord) {
  return {
    Put: {
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      Item: record,
      TableName: tableName,
    },
  };
}

function expectedPut(
  tableName: string,
  record: EnrollmentPersistenceRecord,
  expectedVersion: number,
) {
  return {
    Put: {
      ConditionExpression: "#version = :expectedVersion",
      ExpressionAttributeNames: { "#version": "version" },
      ExpressionAttributeValues: { ":expectedVersion": expectedVersion },
      Item: record,
      TableName: tableName,
    },
  };
}

function ownedPut(
  tableName: string,
  record: EnrollmentPersistenceRecord,
  cognitoSub: string,
) {
  return {
    Put: {
      ConditionExpression: "attribute_not_exists(#pk) OR #cognitoSub = :cognitoSub",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#cognitoSub": "cognitoSub",
      },
      ExpressionAttributeValues: { ":cognitoSub": cognitoSub },
      Item: record,
      TableName: tableName,
    },
  };
}

async function getRecord(
  config: { client: DynamoDbEnrollmentClient; tableName: string },
  key: EnrollmentPersistenceKey,
): Promise<EnrollmentRepositoryResult<EnrollmentPersistenceRecord | null>> {
  try {
    const response = await config.client.send(new GetCommand({
      ConsistentRead: true,
      Key: key,
      TableName: config.tableName,
    }));
    const item = isRecord(response) ? response.Item : undefined;
    if (item === undefined) {
      return ok(null);
    }
    const validation = validateEnrollmentPersistenceRecord(item);
    return validation.ok
      ? ok(validation.value)
      : err("unexpected_client_failure", "DynamoDB returned an invalid enrollment record");
  } catch (error) {
    return dynamoError(error);
  }
}

async function putNew<T extends EnrollmentPersistenceRecord>(
  config: { client: DynamoDbEnrollmentClient; tableName: string },
  record: T,
): Promise<EnrollmentRepositoryResult<T>> {
  const validation = validateEnrollmentPersistenceRecord(record);
  if (!validation.ok) {
    return err("validation_failed", validation.error.message);
  }
  try {
    await config.client.send(new PutCommand({
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      Item: record,
      TableName: config.tableName,
    }));
    return ok(record);
  } catch (error) {
    return dynamoError(error);
  }
}

async function putExpected<T extends EnrollmentPersistenceRecord>(
  config: { client: DynamoDbEnrollmentClient; tableName: string },
  record: T,
  expectedVersion: number,
): Promise<EnrollmentRepositoryResult<T>> {
  const validation = validateEnrollmentPersistenceRecord(record);
  if (!validation.ok) {
    return err("validation_failed", validation.error.message);
  }
  try {
    await config.client.send(new PutCommand({
      ConditionExpression: "#version = :expectedVersion",
      ExpressionAttributeNames: { "#version": "version" },
      ExpressionAttributeValues: { ":expectedVersion": expectedVersion },
      Item: record,
      TableName: config.tableName,
    }));
    return ok(record);
  } catch (error) {
    return dynamoError(error);
  }
}

async function mutateRecord<T extends EnrollmentPersistenceRecord>(
  config: { client: DynamoDbEnrollmentClient; tableName: string },
  key: EnrollmentPersistenceKey,
  recordType: T["recordType"],
  mutate: (record: T) => EnrollmentRepositoryResult<T>,
): Promise<EnrollmentRepositoryResult<T>> {
  const current = await getRecord(config, key);
  if (!current.ok) {
    return current;
  }
  if (!current.value) {
    return err("not_found", "Enrollment persistence record is unavailable");
  }
  if (current.value.recordType !== recordType) {
    return err("unexpected_client_failure", "Enrollment key returned an unexpected record type");
  }
  const typedCurrent = current.value as T;
  const next = mutate(typedCurrent);
  if (!next.ok) {
    return next;
  }
  if (next.value === typedCurrent) {
    return next;
  }
  return putExpected(config, next.value, typedCurrent.version);
}

function consumeOtp(
  record: OtpTransactionRecord,
  input: {
    expectedMode: OtpVerificationMode;
    consumedAt: string;
    nowEpochSeconds: number;
  },
): EnrollmentRepositoryResult<OtpTransactionRecord> {
  if (record.expiresAtEpochSeconds <= input.nowEpochSeconds) {
    return err("expired", "OTP transaction has expired");
  }
  if (record.state !== "ready" || record.mode !== input.expectedMode) {
    return err("conditional_conflict", "OTP transaction is already consumed or mode-bound elsewhere");
  }
  return ok({
    ...record,
    state: "consumed",
    consumedAt: input.consumedAt,
    updatedAt: input.consumedAt,
    version: record.version + 1,
  });
}

function leaseOperation(
  record: ExternalOperationRecord,
  input: {
    owner: string;
    now: string;
    nowEpochSeconds: number;
    leaseExpiresAtEpochSeconds: number;
  },
): EnrollmentRepositoryResult<ExternalOperationRecord> {
  if (record.expiresAtEpochSeconds <= input.nowEpochSeconds) {
    return err("expired", "External operation has expired");
  }
  if (record.attemptCount >= record.maxAttempts) {
    return err("max_attempts_exceeded", "External operation exhausted its attempts");
  }
  if (
    record.state === "succeeded" ||
    record.state === "terminal_review" ||
    (record.nextAttemptAtEpochSeconds !== undefined &&
      record.nextAttemptAtEpochSeconds > input.nowEpochSeconds) ||
    (record.state === "leased" &&
      record.leaseExpiresAtEpochSeconds !== undefined &&
      record.leaseExpiresAtEpochSeconds > input.nowEpochSeconds)
  ) {
    return err("lease_unavailable", "External operation cannot be leased now");
  }
  return ok({
    ...record,
    state: "leased",
    attemptCount: record.attemptCount + 1,
    leaseOwner: input.owner,
    leaseExpiresAtEpochSeconds: input.leaseExpiresAtEpochSeconds,
    updatedAt: input.now,
    version: record.version + 1,
  });
}

function beginExchange(
  record: LaunchNonceRecord,
  input: {
    owner: string;
    attemptId: string;
    now: string;
    nowEpochSeconds: number;
    leaseExpiresAtEpochSeconds: number;
  },
): EnrollmentRepositoryResult<LaunchNonceRecord> {
  if (record.expiresAtEpochSeconds <= input.nowEpochSeconds) {
    return err("expired", "Portal launch nonce has expired");
  }
  if (record.state === "exchanging" && record.exchangeAttemptId === input.attemptId) {
    return ok(record);
  }
  if (
    record.state === "consumed" ||
    (record.state === "exchanging" &&
      record.leaseExpiresAtEpochSeconds !== undefined &&
      record.leaseExpiresAtEpochSeconds > input.nowEpochSeconds)
  ) {
    return err("lease_unavailable", "Portal launch nonce is already in use");
  }
  return ok({
    ...record,
    state: "exchanging",
    exchangeAttemptId: input.attemptId,
    leaseOwner: input.owner,
    leaseExpiresAtEpochSeconds: input.leaseExpiresAtEpochSeconds,
    updatedAt: input.now,
    version: record.version + 1,
  });
}

function markOperationRetryable(
  record: ExternalOperationRecord,
  input: {
    owner: string;
    failedAt: string;
    errorCode: string;
    nextAttemptAtEpochSeconds: number;
  },
): EnrollmentRepositoryResult<ExternalOperationRecord> {
  if (record.state !== "leased" || record.leaseOwner !== input.owner) {
    return err("conditional_conflict", "External operation lease owner does not match");
  }
  return ok({
    ...record,
    state: record.attemptCount >= record.maxAttempts ? "terminal_review" : "retryable",
    errorCode: input.errorCode,
    nextAttemptAtEpochSeconds: input.nextAttemptAtEpochSeconds,
    leaseOwner: undefined,
    leaseExpiresAtEpochSeconds: undefined,
    updatedAt: input.failedAt,
    version: record.version + 1,
  });
}

function markOperationSucceeded(
  record: ExternalOperationRecord,
  input: {
    owner: string;
    completedAt: string;
    resultPointer: string;
  },
): EnrollmentRepositoryResult<ExternalOperationRecord> {
  if (record.state !== "leased" || record.leaseOwner !== input.owner) {
    return err("conditional_conflict", "External operation lease owner does not match");
  }
  return ok({
    ...record,
    state: "succeeded",
    resultPointer: input.resultPointer,
    errorCode: undefined,
    nextAttemptAtEpochSeconds: undefined,
    leaseOwner: undefined,
    leaseExpiresAtEpochSeconds: undefined,
    updatedAt: input.completedAt,
    version: record.version + 1,
  });
}

function consumeNonce(
  record: LaunchNonceRecord,
  input: { attemptId: string; consumedAt: string },
): EnrollmentRepositoryResult<LaunchNonceRecord> {
  if (record.state !== "exchanging" || record.exchangeAttemptId !== input.attemptId) {
    return err("conditional_conflict", "Portal launch exchange does not match the active attempt");
  }
  return ok({
    ...record,
    state: "consumed",
    consumedAt: input.consumedAt,
    updatedAt: input.consumedAt,
    version: record.version + 1,
  });
}

function dynamoError(error: unknown): EnrollmentRepositoryResult<never> {
  const name = isRecord(error) && typeof error.name === "string" ? error.name : "";
  if (name === "ConditionalCheckFailedException" || name === "TransactionCanceledException") {
    return err("conditional_conflict", "DynamoDB enrollment condition was not satisfied");
  }
  if (
    name === "ProvisionedThroughputExceededException" ||
    name === "ThrottlingException" ||
    name === "InternalServerError" ||
    (isRecord(error) && error.$retryable !== undefined)
  ) {
    return err("retryable_client_failure", "DynamoDB enrollment request can be retried");
  }
  return err("unexpected_client_failure", "DynamoDB enrollment request failed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanEnv(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function ok<T>(value: T): EnrollmentRepositoryResult<T> {
  return { ok: true, value };
}

function err(
  code: EnrollmentRepositoryErrorCode,
  message: string,
): EnrollmentRepositoryResult<never> {
  return { ok: false, error: { code, message } };
}
