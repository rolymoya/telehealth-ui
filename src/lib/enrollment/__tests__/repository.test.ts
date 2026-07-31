import { describe, expect, it } from "vitest";
import {
  createEnrollmentRecord,
  createExternalOperationRecord,
  createLaunchNonceRecord,
  createOtpTransactionRecord,
  enrollmentKey,
  externalOperationKey,
  launchNonceKey,
  otpTransactionKey,
  validateEnrollmentPersistenceRecord,
} from "@/lib/enrollment/records";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";

const now = "2026-07-29T01:00:00.000Z";

describe("checkout-as-signup persistence records", () => {
  it("uses direct composite keys for every enrollment access pattern", () => {
    expect(enrollmentKey("apoth_order_opaque_001")).toEqual({
      pk: "ENROLLMENT#apoth_order_opaque_001",
      sk: "ENROLLMENT",
    });
    expect(otpTransactionKey("otp_digest_opaque_001")).toEqual({
      pk: "OTP_TRANSACTION#otp_digest_opaque_001",
      sk: "OTP_TRANSACTION",
    });
    expect(externalOperationKey("operation_opaque_001")).toEqual({
      pk: "EXTERNAL_OPERATION#operation_opaque_001",
      sk: "EXTERNAL_OPERATION",
    });
    expect(launchNonceKey("launch_digest_opaque_001")).toEqual({
      pk: "LAUNCH_NONCE#launch_digest_opaque_001",
      sk: "LAUNCH_NONCE",
    });
  });

  it("rejects raw email, URLs, tokens, and clinical content at the record boundary", () => {
    const base = createEnrollmentRecord({
      attemptBindingHash: "binding_hash_opaque_001",
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now,
    });

    for (const unsafe of [
      { ...base, email: "patient@example.com" },
      { ...base, portalUrl: "https://portal.example/secret" },
      { ...base, accessToken: "secret" },
      { ...base, questionnaireAnswers: { medication: "example" } },
    ]) {
      expect(validateEnrollmentPersistenceRecord(unsafe)).toMatchObject({
        ok: false,
        error: { code: "forbidden_field" },
      });
    }
  });

  it("updates an enrollment only at its expected version", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const record = createEnrollmentRecord({
      attemptBindingHash: "binding_hash_opaque_001",
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now,
    });

    expect(await repository.createEnrollment(record)).toMatchObject({ ok: true });

    const completed = {
      ...record,
      checkout: "completed" as const,
      updatedAt: "2026-07-29T01:01:00.000Z",
      version: 2,
    };
    expect(await repository.updateEnrollment(completed, 1)).toEqual({
      ok: true,
      value: completed,
    });

    expect(await repository.updateEnrollment({
      ...completed,
      checkout: "expired",
      version: 3,
    }, 1)).toMatchObject({
      ok: false,
      error: { code: "conditional_conflict" },
    });
  });

  it("consumes an OTP transaction once and only in its bound mode", async () => {
    const repository = createInMemoryEnrollmentRepository();
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
    await repository.createOtpTransaction(transaction);

    expect(await repository.consumeOtpTransaction({
      consumedAt: "2026-07-29T01:02:00.000Z",
      expectedMode: "returning_sign_in",
      nowEpochSeconds: 1_800_000_100,
      transactionDigest: transaction.transactionDigest,
    })).toMatchObject({
      ok: false,
      error: { code: "conditional_conflict" },
    });

    expect(await repository.consumeOtpTransaction({
      consumedAt: "2026-07-29T01:02:00.000Z",
      expectedMode: "enrollment_verification",
      nowEpochSeconds: 1_800_000_100,
      transactionDigest: transaction.transactionDigest,
    })).toMatchObject({
      ok: true,
      value: { state: "consumed", version: 2 },
    });

    expect(await repository.consumeOtpTransaction({
      consumedAt: "2026-07-29T01:03:00.000Z",
      expectedMode: "enrollment_verification",
      nowEpochSeconds: 1_800_000_200,
      transactionDigest: transaction.transactionDigest,
    })).toMatchObject({
      ok: false,
      error: { code: "conditional_conflict" },
    });
  });

  it("leases external mutations and recovers only after lease expiry", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const operation = createExternalOperationRecord({
      aggregateId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_090_000,
      idempotencyKeyDigest: "idempotency_hash_opaque_001",
      maxAttempts: 3,
      now,
      operationId: "operation_opaque_001",
      operationType: "stripe_checkout",
    });
    await repository.createExternalOperation(operation);

    expect(await repository.leaseExternalOperation({
      leaseExpiresAtEpochSeconds: 1_800_000_060,
      now: "2026-07-29T01:01:00.000Z",
      nowEpochSeconds: 1_800_000_000,
      operationId: operation.operationId,
      owner: "worker_opaque_001",
    })).toMatchObject({
      ok: true,
      value: { attemptCount: 1, state: "leased" },
    });

    expect(await repository.leaseExternalOperation({
      leaseExpiresAtEpochSeconds: 1_800_000_090,
      now: "2026-07-29T01:01:30.000Z",
      nowEpochSeconds: 1_800_000_030,
      operationId: operation.operationId,
      owner: "worker_opaque_002",
    })).toMatchObject({
      ok: false,
      error: { code: "lease_unavailable" },
    });

    expect(await repository.leaseExternalOperation({
      leaseExpiresAtEpochSeconds: 1_800_000_130,
      now: "2026-07-29T01:02:10.000Z",
      nowEpochSeconds: 1_800_000_070,
      operationId: operation.operationId,
      owner: "worker_opaque_002",
    })).toMatchObject({
      ok: true,
      value: { attemptCount: 2, leaseOwner: "worker_opaque_002" },
    });

    expect(await repository.markExternalOperationSucceeded({
      completedAt: "2026-07-29T01:02:20.000Z",
      operationId: operation.operationId,
      owner: "worker_opaque_wrong",
      resultPointer: "cs_opaque_001",
    })).toMatchObject({
      ok: false,
      error: { code: "conditional_conflict" },
    });

    expect(await repository.markExternalOperationSucceeded({
      completedAt: "2026-07-29T01:02:20.000Z",
      operationId: operation.operationId,
      owner: "worker_opaque_002",
      resultPointer: "cs_opaque_001",
    })).toMatchObject({
      ok: true,
      value: {
        leaseOwner: undefined,
        resultPointer: "cs_opaque_001",
        state: "succeeded",
      },
    });
  });

  it("moves one launch nonce through ready, exchanging, and consumed", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const nonce = createLaunchNonceRecord({
      cognitoSub: "cognito-sub-opaque-001",
      expiresAtEpochSeconds: 1_800_000_300,
      nonceDigest: "launch_digest_opaque_001",
      now,
      provider: "synthetic",
    });
    await repository.createLaunchNonce(nonce);

    const exchanging = await repository.beginLaunchExchange({
      attemptId: "launch_attempt_opaque_001",
      leaseExpiresAtEpochSeconds: 1_800_000_060,
      nonceDigest: nonce.nonceDigest,
      now: "2026-07-29T01:01:00.000Z",
      nowEpochSeconds: 1_800_000_000,
      owner: "api_opaque_001",
    });
    expect(exchanging).toMatchObject({
      ok: true,
      value: { state: "exchanging" },
    });

    expect(await repository.consumeLaunchNonce({
      attemptId: "launch_attempt_wrong",
      consumedAt: "2026-07-29T01:01:05.000Z",
      nonceDigest: nonce.nonceDigest,
    })).toMatchObject({
      ok: false,
      error: { code: "conditional_conflict" },
    });

    expect(await repository.consumeLaunchNonce({
      attemptId: "launch_attempt_opaque_001",
      consumedAt: "2026-07-29T01:01:05.000Z",
      nonceDigest: nonce.nonceDigest,
    })).toMatchObject({
      ok: true,
      value: { state: "consumed" },
    });
  });

  it("atomically consumes enrollment OTP and claims the email, account, and Stripe customer", async () => {
    const enrollment = {
      ...createEnrollmentRecord({
        attemptBindingHash: "binding_hash_opaque_001",
        catalogCode: "catalog_opaque_001",
        enrollmentId: "apoth_order_opaque_001",
        expiresAtEpochSeconds: 1_800_003_600,
        now,
      }),
      checkout: "completed" as const,
      paymentSetup: "setup_succeeded" as const,
      stripeCheckoutSessionId: "cs_opaque_001",
      stripeCustomerId: "cus_opaque_001",
      stripeSetupIntentId: "seti_opaque_001",
      version: 2,
    };
    const transaction = createOtpTransactionRecord({
      challengeCorrelationHash: "challenge_hash_opaque_001",
      cognitoUsername: "cognito_username_opaque_001",
      emailFingerprint: "email_hmac_v1_opaque_001",
      emailFingerprintKeyVersion: 1,
      enrollmentId: enrollment.enrollmentId,
      expiresAtEpochSeconds: 1_800_003_600,
      mode: "enrollment_verification",
      now,
      stripeCheckoutSessionId: enrollment.stripeCheckoutSessionId,
      stripeCustomerId: enrollment.stripeCustomerId,
      transactionDigest: "otp_digest_opaque_001",
    });
    const repository = createInMemoryEnrollmentRepository([enrollment, transaction]);

    const result = await repository.bindVerifiedEnrollment({
      cognitoSub: "cognito-sub-opaque-001",
      consumedAt: "2026-07-29T01:10:00.000Z",
      enrollmentId: enrollment.enrollmentId,
      transactionDigest: transaction.transactionDigest,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        accountEnrollment: {
          stripeCustomerId: "cus_opaque_001",
          stripeSetupIntentId: "seti_opaque_001",
        },
        emailClaim: { cognitoSub: "cognito-sub-opaque-001" },
        enrollment: {
          billing: "payment_method_collected",
          cognitoSub: "cognito-sub-opaque-001",
          identity: "verified",
        },
        otpTransaction: { state: "consumed" },
        stripeCustomerClaim: { cognitoSub: "cognito-sub-opaque-001" },
      },
    });

    expect(await repository.bindVerifiedEnrollment({
      cognitoSub: "cognito-sub-opaque-001",
      consumedAt: "2026-07-29T01:11:00.000Z",
      enrollmentId: enrollment.enrollmentId,
      transactionDigest: transaction.transactionDigest,
    })).toMatchObject({
      ok: true,
      value: { enrollment: { identity: "verified" } },
    });
  });
});
