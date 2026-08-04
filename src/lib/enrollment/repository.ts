import type { OtpVerificationMode } from "@/lib/enrollment/contracts";
import {
  createAccountEnrollmentRecord,
  createAccountEnrollmentPointerRecord,
  createEmailClaimRecord,
  createStripeCustomerClaimRecord,
  accountEnrollmentPointerKey,
  enrollmentKey,
  externalOperationKey,
  launchNonceKey,
  otpTransactionKey,
  portalLinkageKey,
  validateEnrollmentPersistenceRecord,
  type EnrollmentPersistenceKey,
  type EnrollmentPersistenceRecord,
  type EnrollmentRecord,
  type AccountEnrollmentRecord,
  type AccountEnrollmentPointerRecord,
  type EmailClaimRecord,
  type ExternalOperationRecord,
  type LaunchNonceRecord,
  type OtpTransactionRecord,
  type PortalLinkageRecord,
  type StripeCustomerClaimRecord,
} from "@/lib/enrollment/records";
import { applyEnrollmentTransition } from "@/lib/enrollment/state-machine";

export type EnrollmentRepositoryErrorCode =
  | "validation_failed"
  | "conditional_conflict"
  | "not_found"
  | "expired"
  | "lease_unavailable"
  | "max_attempts_exceeded"
  | "retryable_client_failure"
  | "unexpected_client_failure";

export type EnrollmentRepositoryResult<T> =
  | { ok: true; value: T }
  | {
    ok: false;
    error: { code: EnrollmentRepositoryErrorCode; message: string };
  };

export interface EnrollmentRepository {
  beginOtpVerification(input: {
    enrollmentId: string;
    now: string;
    transaction: OtpTransactionRecord;
  }): Promise<EnrollmentRepositoryResult<{
    enrollment: EnrollmentRecord;
    transaction: OtpTransactionRecord;
  }>>;
  bindVerifiedEnrollment(input: {
    cognitoSub: string;
    consumedAt: string;
    enrollmentId: string;
    transactionDigest: string;
  }): Promise<EnrollmentRepositoryResult<{
    enrollment: EnrollmentRecord;
    otpTransaction: OtpTransactionRecord;
    emailClaim: EmailClaimRecord;
    stripeCustomerClaim: StripeCustomerClaimRecord;
    accountEnrollment: AccountEnrollmentRecord;
    accountEnrollmentPointer: AccountEnrollmentPointerRecord;
  }>>;
  createCheckoutAttempt(input: {
    enrollment: EnrollmentRecord;
    operation: ExternalOperationRecord;
  }): Promise<EnrollmentRepositoryResult<{
    enrollment: EnrollmentRecord;
    operation: ExternalOperationRecord;
  }>>;
  createEnrollment(record: EnrollmentRecord): Promise<EnrollmentRepositoryResult<EnrollmentRecord>>;
  createVerifiedEnrollmentBinding(input: {
    enrollment: EnrollmentRecord;
    pointer: AccountEnrollmentPointerRecord;
  }): Promise<EnrollmentRepositoryResult<{
    enrollment: EnrollmentRecord;
    pointer: AccountEnrollmentPointerRecord;
  }>>;
  getEnrollment(enrollmentId: string): Promise<EnrollmentRepositoryResult<EnrollmentRecord | null>>;
  updateEnrollment(record: EnrollmentRecord, expectedVersion: number): Promise<EnrollmentRepositoryResult<EnrollmentRecord>>;
  getActiveAccountEnrollment(cognitoSub: string): Promise<EnrollmentRepositoryResult<AccountEnrollmentPointerRecord | null>>;
  createPortalLinkage(record: PortalLinkageRecord): Promise<EnrollmentRepositoryResult<PortalLinkageRecord>>;
  getPortalLinkage(cognitoSub: string): Promise<EnrollmentRepositoryResult<PortalLinkageRecord | null>>;
  createOtpTransaction(record: OtpTransactionRecord): Promise<EnrollmentRepositoryResult<OtpTransactionRecord>>;
  getOtpTransaction(transactionDigest: string): Promise<EnrollmentRepositoryResult<OtpTransactionRecord | null>>;
  consumeOtpTransaction(input: {
    transactionDigest: string;
    expectedMode: OtpVerificationMode;
    consumedAt: string;
    nowEpochSeconds: number;
  }): Promise<EnrollmentRepositoryResult<OtpTransactionRecord>>;
  createExternalOperation(record: ExternalOperationRecord): Promise<EnrollmentRepositoryResult<ExternalOperationRecord>>;
  getExternalOperation(operationId: string): Promise<EnrollmentRepositoryResult<ExternalOperationRecord | null>>;
  leaseExternalOperation(input: {
    operationId: string;
    owner: string;
    now: string;
    nowEpochSeconds: number;
    leaseExpiresAtEpochSeconds: number;
  }): Promise<EnrollmentRepositoryResult<ExternalOperationRecord>>;
  markExternalOperationRetryable(input: {
    operationId: string;
    owner: string;
    failedAt: string;
    errorCode: string;
    nextAttemptAtEpochSeconds: number;
  }): Promise<EnrollmentRepositoryResult<ExternalOperationRecord>>;
  markExternalOperationSucceeded(input: {
    operationId: string;
    owner: string;
    completedAt: string;
    resultPointer: string;
  }): Promise<EnrollmentRepositoryResult<ExternalOperationRecord>>;
  createLaunchNonce(record: LaunchNonceRecord): Promise<EnrollmentRepositoryResult<LaunchNonceRecord>>;
  beginLaunchExchange(input: {
    nonceDigest: string;
    owner: string;
    attemptId: string;
    now: string;
    nowEpochSeconds: number;
    leaseExpiresAtEpochSeconds: number;
  }): Promise<EnrollmentRepositoryResult<LaunchNonceRecord>>;
  consumeLaunchNonce(input: {
    nonceDigest: string;
    attemptId: string;
    consumedAt: string;
  }): Promise<EnrollmentRepositoryResult<LaunchNonceRecord>>;
}

export function createInMemoryEnrollmentRepository(
  seed: EnrollmentPersistenceRecord[] = [],
): EnrollmentRepository {
  const records = new Map<string, EnrollmentPersistenceRecord>();
  for (const record of seed) {
    records.set(mapKey(record), clone(record));
  }

  return {
    async beginOtpVerification(input) {
      const enrollmentMapKey = mapKey(enrollmentKey(input.enrollmentId));
      const transactionMapKey = mapKey(input.transaction);
      const enrollment = records.get(enrollmentMapKey);
      if (!enrollment || enrollment.recordType !== "enrollment") {
        return err("not_found", "Enrollment is unavailable for verification");
      }
      if (
        records.has(transactionMapKey) ||
        enrollment.checkout !== "completed" ||
        enrollment.paymentSetup !== "setup_succeeded" ||
        input.transaction.enrollmentId !== enrollment.enrollmentId ||
        input.transaction.stripeCustomerId !== enrollment.stripeCustomerId ||
        input.transaction.stripeCheckoutSessionId !== enrollment.stripeCheckoutSessionId
      ) {
        return err("conditional_conflict", "Enrollment cannot begin this OTP verification");
      }
      const transitioned = applyEnrollmentTransition(enrollment, {
        changes: { identity: "verification_pending" },
      });
      if (!transitioned.ok) {
        return err("conditional_conflict", transitioned.error.message);
      }
      const updated: EnrollmentRecord = {
        ...enrollment,
        ...transitioned.value,
        updatedAt: input.now,
        version: enrollment.version + 1,
      };
      records.set(enrollmentMapKey, clone(updated));
      records.set(transactionMapKey, clone(input.transaction));
      return ok({ enrollment: clone(updated), transaction: clone(input.transaction) });
    },

    async bindVerifiedEnrollment(input) {
      const enrollmentMapKey = mapKey(enrollmentKey(input.enrollmentId));
      const otpMapKey = mapKey(otpTransactionKey(input.transactionDigest));
      const enrollment = records.get(enrollmentMapKey);
      const transaction = records.get(otpMapKey);
      if (!enrollment || enrollment.recordType !== "enrollment" ||
          !transaction || transaction.recordType !== "otpTransaction") {
        return err("not_found", "Enrollment verification transaction is unavailable");
      }
      const claims = bindingClaims(enrollment, transaction, input);
      if (!claims.ok) {
        return claims;
      }

      if (enrollment.identity === "verified" && transaction.state === "consumed") {
        if (enrollment.cognitoSub !== input.cognitoSub) {
          return err("conditional_conflict", "Enrollment already belongs to another account");
        }
        const existingEmail = records.get(mapKey(claims.value.emailClaim));
        const existingStripe = records.get(mapKey(claims.value.stripeCustomerClaim));
        const existingAccount = records.get(mapKey(claims.value.accountEnrollment));
        const existingPointer = records.get(mapKey(claims.value.accountEnrollmentPointer));
        if (
          existingEmail?.recordType === "emailClaim" &&
          existingStripe?.recordType === "stripeCustomerClaim" &&
          existingAccount?.recordType === "accountEnrollment" &&
          existingPointer?.recordType === "accountEnrollmentPointer"
        ) {
          return ok({
            enrollment: clone(enrollment),
            otpTransaction: clone(transaction),
            emailClaim: clone(existingEmail),
            stripeCustomerClaim: clone(existingStripe),
            accountEnrollment: clone(existingAccount),
            accountEnrollmentPointer: clone(existingPointer),
          });
        }
        return err("conditional_conflict", "Verified enrollment linkage is incomplete");
      }

      for (const claim of [
        claims.value.emailClaim,
        claims.value.stripeCustomerClaim,
        claims.value.accountEnrollment,
      ]) {
        const existing = records.get(mapKey(claim));
        if (existing &&
            (!("cognitoSub" in existing) || existing.cognitoSub !== input.cognitoSub)) {
          return err("conditional_conflict", "Enrollment claim belongs to another account");
        }
      }

      const existingPointer = records.get(mapKey(claims.value.accountEnrollmentPointer));
      if (
        existingPointer &&
        (existingPointer.recordType !== "accountEnrollmentPointer" ||
          existingPointer.cognitoSub !== input.cognitoSub)
      ) {
        return err("conditional_conflict", "Active enrollment pointer belongs to another account");
      }

      records.set(enrollmentMapKey, clone(claims.value.enrollment));
      records.set(otpMapKey, clone(claims.value.otpTransaction));
      records.set(mapKey(claims.value.emailClaim), clone(claims.value.emailClaim));
      records.set(mapKey(claims.value.stripeCustomerClaim), clone(claims.value.stripeCustomerClaim));
      records.set(mapKey(claims.value.accountEnrollment), clone(claims.value.accountEnrollment));
      records.set(
        mapKey(claims.value.accountEnrollmentPointer),
        clone(claims.value.accountEnrollmentPointer),
      );
      return ok(claims.value);
    },

    async createVerifiedEnrollmentBinding(input) {
      const enrollmentValidation = validateEnrollmentPersistenceRecord(input.enrollment);
      const pointerValidation = validateEnrollmentPersistenceRecord(input.pointer);
      if (
        !enrollmentValidation.ok ||
        !pointerValidation.ok ||
        input.enrollment.identity !== "verified" ||
        input.enrollment.cognitoSub !== input.pointer.cognitoSub ||
        input.enrollment.enrollmentId !== input.pointer.enrollmentId ||
        input.enrollment.expiresAtEpochSeconds !== undefined
      ) {
        return err("validation_failed", "Verified enrollment binding is invalid");
      }
      if (records.has(mapKey(input.enrollment)) || records.has(mapKey(input.pointer))) {
        return err("conditional_conflict", "Verified enrollment binding already exists");
      }
      records.set(mapKey(input.enrollment), clone(input.enrollment));
      records.set(mapKey(input.pointer), clone(input.pointer));
      return ok({
        enrollment: clone(input.enrollment),
        pointer: clone(input.pointer),
      });
    },

    async createCheckoutAttempt(input) {
      const enrollmentValidation = validateEnrollmentPersistenceRecord(input.enrollment);
      const operationValidation = validateEnrollmentPersistenceRecord(input.operation);
      if (!enrollmentValidation.ok || !operationValidation.ok) {
        return err(
          "validation_failed",
          enrollmentValidation.ok
            ? operationValidation.ok ? "Invalid checkout attempt" : operationValidation.error.message
            : enrollmentValidation.error.message,
        );
      }
      const enrollmentMapKey = mapKey(input.enrollment);
      const operationMapKey = mapKey(input.operation);
      if (records.has(enrollmentMapKey) || records.has(operationMapKey)) {
        return err("conditional_conflict", "Checkout attempt already exists");
      }
      records.set(enrollmentMapKey, clone(input.enrollment));
      records.set(operationMapKey, clone(input.operation));
      return ok({
        enrollment: clone(input.enrollment),
        operation: clone(input.operation),
      });
    },

    async createEnrollment(record) {
      return createRecord(records, record);
    },

    async getEnrollment(enrollmentId) {
      const record = records.get(mapKey(enrollmentKey(enrollmentId)));
      if (!record) {
        return ok(null);
      }
      return record.recordType === "enrollment"
        ? ok(clone(record))
        : err("validation_failed", "Enrollment key contains an unexpected record type");
    },

    async updateEnrollment(record, expectedVersion) {
      const validation = validateEnrollmentPersistenceRecord(record);
      if (!validation.ok || validation.value.recordType !== "enrollment") {
        return err("validation_failed", validation.ok
          ? "Expected an enrollment record"
          : validation.error.message);
      }
      const key = mapKey(record);
      const current = records.get(key);
      if (
        !current ||
        current.recordType !== "enrollment" ||
        current.version !== expectedVersion ||
        record.version !== expectedVersion + 1
      ) {
        return err("conditional_conflict", "Enrollment version changed before update");
      }
      records.set(key, clone(record));
      return ok(clone(record));
    },

    async getActiveAccountEnrollment(cognitoSub) {
      const record = records.get(mapKey(accountEnrollmentPointerKey(cognitoSub)));
      if (!record) {
        return ok(null);
      }
      return record.recordType === "accountEnrollmentPointer"
        ? ok(clone(record))
        : err("validation_failed", "Active enrollment key contains an unexpected record type");
    },

    async createPortalLinkage(record) {
      return createRecord(records, record);
    },

    async getPortalLinkage(cognitoSub) {
      const record = records.get(mapKey(portalLinkageKey(cognitoSub)));
      if (!record) {
        return ok(null);
      }
      return record.recordType === "portalLinkage"
        ? ok(clone(record))
        : err("validation_failed", "Portal linkage key contains an unexpected record type");
    },

    async createOtpTransaction(record) {
      return createRecord(records, record);
    },

    async getOtpTransaction(transactionDigest) {
      const record = records.get(mapKey(otpTransactionKey(transactionDigest)));
      if (!record) {
        return ok(null);
      }
      return record.recordType === "otpTransaction"
        ? ok(clone(record))
        : err("validation_failed", "OTP transaction key contains an unexpected record type");
    },

    async consumeOtpTransaction(input) {
      const key = mapKey(otpTransactionKey(input.transactionDigest));
      const record = records.get(key);
      if (!record || record.recordType !== "otpTransaction") {
        return err("not_found", "OTP transaction is unavailable");
      }
      if (record.expiresAtEpochSeconds <= input.nowEpochSeconds) {
        return err("expired", "OTP transaction has expired");
      }
      if (record.state !== "ready" || record.mode !== input.expectedMode) {
        return err("conditional_conflict", "OTP transaction is already consumed or mode-bound elsewhere");
      }
      const consumed: OtpTransactionRecord = {
        ...record,
        state: "consumed",
        consumedAt: input.consumedAt,
        updatedAt: input.consumedAt,
        version: record.version + 1,
      };
      records.set(key, consumed);
      return ok(clone(consumed));
    },

    async createExternalOperation(record) {
      return createRecord(records, record);
    },

    async getExternalOperation(operationId) {
      const record = records.get(mapKey(externalOperationKey(operationId)));
      if (!record) {
        return ok(null);
      }
      return record.recordType === "externalOperation"
        ? ok(clone(record))
        : err("validation_failed", "External operation key contains an unexpected record type");
    },

    async leaseExternalOperation(input) {
      const key = mapKey(externalOperationKey(input.operationId));
      const record = records.get(key);
      if (!record || record.recordType !== "externalOperation") {
        return err("not_found", "External operation is unavailable");
      }
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
      const leased: ExternalOperationRecord = {
        ...record,
        state: "leased",
        attemptCount: record.attemptCount + 1,
        leaseOwner: input.owner,
        leaseExpiresAtEpochSeconds: input.leaseExpiresAtEpochSeconds,
        updatedAt: input.now,
        version: record.version + 1,
      };
      records.set(key, leased);
      return ok(clone(leased));
    },

    async markExternalOperationRetryable(input) {
      const key = mapKey(externalOperationKey(input.operationId));
      const record = records.get(key);
      if (
        !record ||
        record.recordType !== "externalOperation" ||
        record.state !== "leased" ||
        record.leaseOwner !== input.owner
      ) {
        return err("conditional_conflict", "External operation lease owner does not match");
      }
      const retryable: ExternalOperationRecord = {
        ...record,
        state: record.attemptCount >= record.maxAttempts ? "terminal_review" : "retryable",
        errorCode: input.errorCode,
        nextAttemptAtEpochSeconds: input.nextAttemptAtEpochSeconds,
        leaseOwner: undefined,
        leaseExpiresAtEpochSeconds: undefined,
        updatedAt: input.failedAt,
        version: record.version + 1,
      };
      records.set(key, retryable);
      return ok(clone(retryable));
    },

    async markExternalOperationSucceeded(input) {
      const key = mapKey(externalOperationKey(input.operationId));
      const record = records.get(key);
      if (
        !record ||
        record.recordType !== "externalOperation" ||
        record.state !== "leased" ||
        record.leaseOwner !== input.owner
      ) {
        return err("conditional_conflict", "External operation lease owner does not match");
      }
      const succeeded: ExternalOperationRecord = {
        ...record,
        state: "succeeded",
        resultPointer: input.resultPointer,
        errorCode: undefined,
        nextAttemptAtEpochSeconds: undefined,
        leaseOwner: undefined,
        leaseExpiresAtEpochSeconds: undefined,
        updatedAt: input.completedAt,
        version: record.version + 1,
      };
      records.set(key, succeeded);
      return ok(clone(succeeded));
    },

    async createLaunchNonce(record) {
      return createRecord(records, record);
    },

    async beginLaunchExchange(input) {
      const key = mapKey(launchNonceKey(input.nonceDigest));
      const record = records.get(key);
      if (!record || record.recordType !== "launchNonce") {
        return err("not_found", "Portal launch nonce is unavailable");
      }
      if (record.expiresAtEpochSeconds <= input.nowEpochSeconds) {
        return err("expired", "Portal launch nonce has expired");
      }
      if (record.state === "exchanging" && record.exchangeAttemptId === input.attemptId) {
        return ok(clone(record));
      }
      if (
        record.state === "consumed" ||
        (record.state === "exchanging" &&
          record.leaseExpiresAtEpochSeconds !== undefined &&
          record.leaseExpiresAtEpochSeconds > input.nowEpochSeconds)
      ) {
        return err("lease_unavailable", "Portal launch nonce is already in use");
      }
      const exchanging: LaunchNonceRecord = {
        ...record,
        state: "exchanging",
        exchangeAttemptId: input.attemptId,
        leaseOwner: input.owner,
        leaseExpiresAtEpochSeconds: input.leaseExpiresAtEpochSeconds,
        updatedAt: input.now,
        version: record.version + 1,
      };
      records.set(key, exchanging);
      return ok(clone(exchanging));
    },

    async consumeLaunchNonce(input) {
      const key = mapKey(launchNonceKey(input.nonceDigest));
      const record = records.get(key);
      if (
        !record ||
        record.recordType !== "launchNonce" ||
        record.state !== "exchanging" ||
        record.exchangeAttemptId !== input.attemptId
      ) {
        return err("conditional_conflict", "Portal launch exchange does not match the active attempt");
      }
      const consumed: LaunchNonceRecord = {
        ...record,
        state: "consumed",
        consumedAt: input.consumedAt,
        updatedAt: input.consumedAt,
        version: record.version + 1,
      };
      records.set(key, consumed);
      return ok(clone(consumed));
    },
  };
}

export function bindingClaims(
  enrollment: EnrollmentRecord,
  transaction: OtpTransactionRecord,
  input: {
    cognitoSub: string;
    consumedAt: string;
    enrollmentId: string;
    transactionDigest: string;
  },
): EnrollmentRepositoryResult<{
  enrollment: EnrollmentRecord;
  otpTransaction: OtpTransactionRecord;
  emailClaim: EmailClaimRecord;
  stripeCustomerClaim: StripeCustomerClaimRecord;
  accountEnrollment: AccountEnrollmentRecord;
  accountEnrollmentPointer: AccountEnrollmentPointerRecord;
}> {
  if (
    transaction.transactionDigest !== input.transactionDigest ||
    transaction.mode !== "enrollment_verification" ||
    transaction.enrollmentId !== enrollment.enrollmentId ||
    enrollment.enrollmentId !== input.enrollmentId ||
    transaction.stripeCustomerId !== enrollment.stripeCustomerId ||
    transaction.stripeCheckoutSessionId !== enrollment.stripeCheckoutSessionId ||
    !enrollment.stripeCustomerId ||
    !enrollment.stripeSetupIntentId ||
    enrollment.paymentSetup !== "setup_succeeded"
  ) {
    return err("conditional_conflict", "Enrollment verification evidence does not match");
  }

  if (enrollment.identity === "verified" && transaction.state === "consumed") {
    if (enrollment.cognitoSub !== input.cognitoSub) {
      return err("conditional_conflict", "Enrollment already belongs to another account");
    }
    return ok(createBindingResult(enrollment, transaction, input));
  }
  if (enrollment.identity === "verified" || transaction.state !== "ready") {
    return err("conditional_conflict", "Enrollment verification was already consumed");
  }

  const transitioned = applyEnrollmentTransition(enrollment, {
    changes: {
      billing: "payment_method_collected",
      identity: "verified",
    },
    evidence: {
      identityVerification: {
        cognitoSub: input.cognitoSub,
        mode: "enrollment_verification",
        transactionId: transaction.transactionDigest,
      },
    },
  });
  if (!transitioned.ok) {
    return err("conditional_conflict", transitioned.error.message);
  }
  return ok(createBindingResult({
    ...enrollment,
    ...transitioned.value,
    expiresAtEpochSeconds: undefined,
    updatedAt: input.consumedAt,
    version: enrollment.version + 1,
  }, {
    ...transaction,
    consumedAt: input.consumedAt,
    state: "consumed",
    updatedAt: input.consumedAt,
    version: transaction.version + 1,
  }, input));
}

function createBindingResult(
  enrollment: EnrollmentRecord,
  transaction: OtpTransactionRecord,
  input: { cognitoSub: string; consumedAt: string },
) {
  const emailClaim = createEmailClaimRecord({
    cognitoSub: input.cognitoSub,
    cognitoUsername: transaction.cognitoUsername,
    emailFingerprint: transaction.emailFingerprint,
    emailFingerprintKeyVersion: transaction.emailFingerprintKeyVersion,
    now: input.consumedAt,
  });
  const stripeCustomerClaim = createStripeCustomerClaimRecord({
    cognitoSub: input.cognitoSub,
    enrollmentId: enrollment.enrollmentId,
    now: input.consumedAt,
    stripeCustomerId: enrollment.stripeCustomerId!,
  });
  const accountEnrollment = createAccountEnrollmentRecord({
    cognitoSub: input.cognitoSub,
    enrollmentId: enrollment.enrollmentId,
    now: input.consumedAt,
    stripeCustomerId: enrollment.stripeCustomerId!,
    stripeSetupIntentId: enrollment.stripeSetupIntentId!,
  });
  const accountEnrollmentPointer = createAccountEnrollmentPointerRecord({
    cognitoSub: input.cognitoSub,
    enrollmentId: enrollment.enrollmentId,
    now: input.consumedAt,
  });
  return {
    enrollment,
    otpTransaction: transaction,
    emailClaim,
    stripeCustomerClaim,
    accountEnrollment,
    accountEnrollmentPointer,
  };
}

function createRecord<T extends EnrollmentPersistenceRecord>(
  records: Map<string, EnrollmentPersistenceRecord>,
  record: T,
): EnrollmentRepositoryResult<T> {
  const validation = validateEnrollmentPersistenceRecord(record);
  if (!validation.ok) {
    return err("validation_failed", validation.error.message);
  }
  const key = mapKey(record);
  if (records.has(key)) {
    return err("conditional_conflict", "Enrollment persistence record already exists");
  }
  records.set(key, clone(record));
  return ok(clone(record));
}

function mapKey(key: EnrollmentPersistenceKey) {
  return `${key.pk}\u0000${key.sk}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
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
