import type {
  EnrollmentSnapshot,
  OtpVerificationMode,
} from "@/lib/enrollment/contracts";
import { createPendingEnrollment } from "@/lib/enrollment/state-machine";

export type EnrollmentPersistenceKey = { pk: string; sk: string };

type BasePersistenceRecord = EnrollmentPersistenceKey & {
  schemaVersion: 1;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAtEpochSeconds?: number;
};

export type EnrollmentRecord = BasePersistenceRecord &
  EnrollmentSnapshot & {
    recordType: "enrollment";
    enrollmentId: string;
    attemptBindingHash: string;
    catalogCode: string;
    emailFingerprint?: string;
    emailFingerprintKeyVersion?: number;
    stripeCheckoutSessionId?: string;
    stripeCustomerId?: string;
    stripeSetupIntentId?: string;
    consentVersion?: string;
    consentAcceptedAt?: string;
    expiresAtEpochSeconds?: number;
  };

export type OtpTransactionRecord = BasePersistenceRecord & {
  recordType: "otpTransaction";
  transactionDigest: string;
  mode: OtpVerificationMode;
  state: "ready" | "consumed";
  emailFingerprint: string;
  emailFingerprintKeyVersion: number;
  cognitoUsername: string;
  challengeCorrelationHash: string;
  attemptCount: number;
  resendAvailableAtEpochSeconds?: number;
  enrollmentId?: string;
  stripeCustomerId?: string;
  stripeCheckoutSessionId?: string;
  consumedAt?: string;
  expiresAtEpochSeconds: number;
};

export type ExternalOperationType =
  | "stripe_checkout"
  | "cognito_provisioning"
  | "provider_provisioning"
  | "portal_launch"
  | "billing_activation";

export type ExternalOperationState =
  | "intent"
  | "leased"
  | "succeeded"
  | "retryable"
  | "terminal_review";

export type ExternalOperationRecord = BasePersistenceRecord & {
  recordType: "externalOperation";
  operationId: string;
  operationType: ExternalOperationType;
  aggregateId: string;
  idempotencyKeyDigest: string;
  state: ExternalOperationState;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner?: string;
  leaseExpiresAtEpochSeconds?: number;
  nextAttemptAtEpochSeconds?: number;
  resultPointer?: string;
  errorCode?: string;
  expiresAtEpochSeconds: number;
};

export type LaunchNonceRecord = BasePersistenceRecord & {
  recordType: "launchNonce";
  nonceDigest: string;
  cognitoSub: string;
  provider: string;
  purpose: "patient_portal";
  state: "ready" | "exchanging" | "consumed";
  exchangeAttemptId?: string;
  leaseOwner?: string;
  leaseExpiresAtEpochSeconds?: number;
  consumedAt?: string;
  expiresAtEpochSeconds: number;
};

export type EmailClaimRecord = BasePersistenceRecord & {
  recordType: "emailClaim";
  emailFingerprint: string;
  emailFingerprintKeyVersion: number;
  cognitoSub: string;
  cognitoUsername: string;
  claimedAt: string;
};

export type StripeCustomerClaimRecord = BasePersistenceRecord & {
  recordType: "stripeCustomerClaim";
  stripeCustomerId: string;
  enrollmentId: string;
  cognitoSub: string;
  claimedAt: string;
};

export type AccountEnrollmentRecord = BasePersistenceRecord & {
  recordType: "accountEnrollment";
  enrollmentId: string;
  cognitoSub: string;
  stripeCustomerId: string;
  stripeSetupIntentId: string;
  linkedAt: string;
};

export type AccountEnrollmentPointerRecord = BasePersistenceRecord & {
  recordType: "accountEnrollmentPointer";
  enrollmentId: string;
  cognitoSub: string;
  linkedAt: string;
};

export type PortalLinkageRecord = BasePersistenceRecord & {
  recordType: "portalLinkage";
  cognitoSub: string;
  enrollmentId: string;
  provider: string;
  providerPatientId: string;
  providerCaseId?: string;
  state: "ready" | "blocked";
  provisionedAt: string;
};

export type EnrollmentPersistenceRecord =
  | EnrollmentRecord
  | OtpTransactionRecord
  | ExternalOperationRecord
  | LaunchNonceRecord
  | EmailClaimRecord
  | StripeCustomerClaimRecord
  | AccountEnrollmentRecord
  | AccountEnrollmentPointerRecord
  | PortalLinkageRecord;

export type EnrollmentRecordValidation =
  | { ok: true; value: EnrollmentPersistenceRecord }
  | {
    ok: false;
    error: {
      code: "invalid_record" | "forbidden_field";
      message: string;
    };
  };

export function enrollmentKey(enrollmentId: string): EnrollmentPersistenceKey {
  return { pk: `ENROLLMENT#${enrollmentId}`, sk: "ENROLLMENT" };
}

export function otpTransactionKey(transactionDigest: string): EnrollmentPersistenceKey {
  return {
    pk: `OTP_TRANSACTION#${transactionDigest}`,
    sk: "OTP_TRANSACTION",
  };
}

export function externalOperationKey(operationId: string): EnrollmentPersistenceKey {
  return {
    pk: `EXTERNAL_OPERATION#${operationId}`,
    sk: "EXTERNAL_OPERATION",
  };
}

export function launchNonceKey(nonceDigest: string): EnrollmentPersistenceKey {
  return { pk: `LAUNCH_NONCE#${nonceDigest}`, sk: "LAUNCH_NONCE" };
}

export function emailClaimKey(emailFingerprint: string): EnrollmentPersistenceKey {
  return { pk: `EMAIL_CLAIM#${emailFingerprint}`, sk: "EMAIL_CLAIM" };
}

export function stripeCustomerClaimKey(stripeCustomerId: string): EnrollmentPersistenceKey {
  return {
    pk: `STRIPE#CUSTOMER#${stripeCustomerId}`,
    sk: "ENROLLMENT_CLAIM",
  };
}

export function accountEnrollmentKey(
  cognitoSub: string,
  enrollmentId: string,
): EnrollmentPersistenceKey {
  return {
    pk: `PATIENT#${cognitoSub}`,
    sk: `ENROLLMENT#${enrollmentId}`,
  };
}

export function accountEnrollmentPointerKey(
  cognitoSub: string,
): EnrollmentPersistenceKey {
  return {
    pk: `PATIENT#${cognitoSub}`,
    sk: "ENROLLMENT#ACTIVE",
  };
}

export function portalLinkageKey(cognitoSub: string): EnrollmentPersistenceKey {
  return {
    pk: `PATIENT#${cognitoSub}`,
    sk: "PORTAL#LINKAGE",
  };
}

export function createEmailClaimRecord(input: {
  emailFingerprint: string;
  emailFingerprintKeyVersion: number;
  cognitoSub: string;
  cognitoUsername: string;
  now: string;
}): EmailClaimRecord {
  return {
    ...emailClaimKey(input.emailFingerprint),
    recordType: "emailClaim",
    schemaVersion: 1,
    version: 1,
    emailFingerprint: input.emailFingerprint,
    emailFingerprintKeyVersion: input.emailFingerprintKeyVersion,
    cognitoSub: input.cognitoSub,
    cognitoUsername: input.cognitoUsername,
    claimedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createStripeCustomerClaimRecord(input: {
  stripeCustomerId: string;
  enrollmentId: string;
  cognitoSub: string;
  now: string;
}): StripeCustomerClaimRecord {
  return {
    ...stripeCustomerClaimKey(input.stripeCustomerId),
    recordType: "stripeCustomerClaim",
    schemaVersion: 1,
    version: 1,
    stripeCustomerId: input.stripeCustomerId,
    enrollmentId: input.enrollmentId,
    cognitoSub: input.cognitoSub,
    claimedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createAccountEnrollmentRecord(input: {
  enrollmentId: string;
  cognitoSub: string;
  stripeCustomerId: string;
  stripeSetupIntentId: string;
  now: string;
}): AccountEnrollmentRecord {
  return {
    ...accountEnrollmentKey(input.cognitoSub, input.enrollmentId),
    recordType: "accountEnrollment",
    schemaVersion: 1,
    version: 1,
    enrollmentId: input.enrollmentId,
    cognitoSub: input.cognitoSub,
    stripeCustomerId: input.stripeCustomerId,
    stripeSetupIntentId: input.stripeSetupIntentId,
    linkedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createAccountEnrollmentPointerRecord(input: {
  enrollmentId: string;
  cognitoSub: string;
  now: string;
}): AccountEnrollmentPointerRecord {
  return {
    ...accountEnrollmentPointerKey(input.cognitoSub),
    recordType: "accountEnrollmentPointer",
    schemaVersion: 1,
    version: 1,
    enrollmentId: input.enrollmentId,
    cognitoSub: input.cognitoSub,
    linkedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createPortalLinkageRecord(input: {
  cognitoSub: string;
  enrollmentId: string;
  provider: string;
  providerPatientId: string;
  providerCaseId?: string;
  now: string;
}): PortalLinkageRecord {
  return {
    ...portalLinkageKey(input.cognitoSub),
    recordType: "portalLinkage",
    schemaVersion: 1,
    version: 1,
    cognitoSub: input.cognitoSub,
    enrollmentId: input.enrollmentId,
    provider: input.provider,
    providerPatientId: input.providerPatientId,
    providerCaseId: input.providerCaseId,
    state: "ready",
    provisionedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createEnrollmentRecord(input: {
  enrollmentId: string;
  attemptBindingHash: string;
  catalogCode: string;
  expiresAtEpochSeconds: number;
  now: string;
}): EnrollmentRecord {
  return {
    ...enrollmentKey(input.enrollmentId),
    ...createPendingEnrollment(),
    recordType: "enrollment",
    schemaVersion: 1,
    version: 1,
    enrollmentId: input.enrollmentId,
    attemptBindingHash: input.attemptBindingHash,
    catalogCode: input.catalogCode,
    createdAt: input.now,
    updatedAt: input.now,
    expiresAtEpochSeconds: input.expiresAtEpochSeconds,
  };
}

export function createOtpTransactionRecord(input: {
  transactionDigest: string;
  mode: OtpVerificationMode;
  emailFingerprint: string;
  emailFingerprintKeyVersion: number;
  cognitoUsername: string;
  challengeCorrelationHash: string;
  expiresAtEpochSeconds: number;
  now: string;
  enrollmentId?: string;
  stripeCustomerId?: string;
  stripeCheckoutSessionId?: string;
}): OtpTransactionRecord {
  return {
    ...otpTransactionKey(input.transactionDigest),
    recordType: "otpTransaction",
    schemaVersion: 1,
    version: 1,
    transactionDigest: input.transactionDigest,
    mode: input.mode,
    state: "ready",
    emailFingerprint: input.emailFingerprint,
    emailFingerprintKeyVersion: input.emailFingerprintKeyVersion,
    cognitoUsername: input.cognitoUsername,
    challengeCorrelationHash: input.challengeCorrelationHash,
    attemptCount: 0,
    enrollmentId: input.enrollmentId,
    stripeCustomerId: input.stripeCustomerId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    createdAt: input.now,
    updatedAt: input.now,
    expiresAtEpochSeconds: input.expiresAtEpochSeconds,
  };
}

export function createExternalOperationRecord(input: {
  operationId: string;
  operationType: ExternalOperationType;
  aggregateId: string;
  idempotencyKeyDigest: string;
  maxAttempts: number;
  expiresAtEpochSeconds: number;
  now: string;
}): ExternalOperationRecord {
  return {
    ...externalOperationKey(input.operationId),
    recordType: "externalOperation",
    schemaVersion: 1,
    version: 1,
    operationId: input.operationId,
    operationType: input.operationType,
    aggregateId: input.aggregateId,
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    state: "intent",
    attemptCount: 0,
    maxAttempts: input.maxAttempts,
    createdAt: input.now,
    updatedAt: input.now,
    expiresAtEpochSeconds: input.expiresAtEpochSeconds,
  };
}

export function createLaunchNonceRecord(input: {
  nonceDigest: string;
  cognitoSub: string;
  provider: string;
  expiresAtEpochSeconds: number;
  now: string;
}): LaunchNonceRecord {
  return {
    ...launchNonceKey(input.nonceDigest),
    recordType: "launchNonce",
    schemaVersion: 1,
    version: 1,
    nonceDigest: input.nonceDigest,
    cognitoSub: input.cognitoSub,
    provider: input.provider,
    purpose: "patient_portal",
    state: "ready",
    createdAt: input.now,
    updatedAt: input.now,
    expiresAtEpochSeconds: input.expiresAtEpochSeconds,
  };
}

const allowedFieldsByRecordType: Record<EnrollmentPersistenceRecord["recordType"], Set<string>> = {
  enrollment: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "expiresAtEpochSeconds", "enrollmentId", "attemptBindingHash", "catalogCode",
    "checkout", "paymentSetup", "identity", "portalHandoff", "care", "billing",
    "cognitoSub", "portalCaseId", "billingActivationDecisionId", "emailFingerprint",
    "emailFingerprintKeyVersion", "stripeCheckoutSessionId", "stripeCustomerId",
    "stripeSetupIntentId", "consentVersion", "consentAcceptedAt",
  ]),
  otpTransaction: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "expiresAtEpochSeconds", "transactionDigest", "mode", "state", "emailFingerprint",
    "emailFingerprintKeyVersion", "cognitoUsername", "challengeCorrelationHash",
    "attemptCount", "resendAvailableAtEpochSeconds", "enrollmentId", "stripeCustomerId",
    "stripeCheckoutSessionId", "consumedAt",
  ]),
  externalOperation: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "expiresAtEpochSeconds", "operationId", "operationType", "aggregateId",
    "idempotencyKeyDigest", "state", "attemptCount", "maxAttempts", "leaseOwner",
    "leaseExpiresAtEpochSeconds", "nextAttemptAtEpochSeconds", "resultPointer", "errorCode",
  ]),
  launchNonce: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "expiresAtEpochSeconds", "nonceDigest", "cognitoSub", "provider", "purpose", "state",
    "exchangeAttemptId", "leaseOwner", "leaseExpiresAtEpochSeconds", "consumedAt",
  ]),
  emailClaim: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "emailFingerprint", "emailFingerprintKeyVersion", "cognitoSub", "cognitoUsername",
    "claimedAt",
  ]),
  stripeCustomerClaim: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "stripeCustomerId", "enrollmentId", "cognitoSub", "claimedAt",
  ]),
  accountEnrollment: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "enrollmentId", "cognitoSub", "stripeCustomerId", "stripeSetupIntentId", "linkedAt",
  ]),
  accountEnrollmentPointer: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "enrollmentId", "cognitoSub", "linkedAt",
  ]),
  portalLinkage: new Set([
    "pk", "sk", "recordType", "schemaVersion", "version", "createdAt", "updatedAt",
    "cognitoSub", "enrollmentId", "provider", "providerPatientId", "providerCaseId",
    "state", "provisionedAt",
  ]),
};

export function validateEnrollmentPersistenceRecord(
  value: unknown,
): EnrollmentRecordValidation {
  if (!isRecord(value) || typeof value.recordType !== "string") {
    return invalid("Enrollment persistence record is not an object");
  }

  if (!(value.recordType in allowedFieldsByRecordType)) {
    return invalid("Enrollment persistence record type is unsupported");
  }

  const recordType = value.recordType as EnrollmentPersistenceRecord["recordType"];
  const allowedFields = allowedFieldsByRecordType[recordType];
  const forbiddenField = Object.keys(value).find((field) => !allowedFields.has(field));
  if (forbiddenField) {
    return {
      ok: false,
      error: {
        code: "forbidden_field",
        message: `Field ${forbiddenField} is forbidden in enrollment persistence`,
      },
    };
  }

  if (
    value.schemaVersion !== 1 ||
    !isPositiveInteger(value.version) ||
    (value.expiresAtEpochSeconds !== undefined &&
      !isPositiveInteger(value.expiresAtEpochSeconds)) ||
    typeof value.pk !== "string" ||
    typeof value.sk !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return invalid("Enrollment persistence record base fields are invalid");
  }

  const requiresTtl = recordType === "otpTransaction" ||
    recordType === "externalOperation" ||
    recordType === "launchNonce" ||
    (recordType === "enrollment" && value.identity !== "verified");
  if (requiresTtl && !isPositiveInteger(value.expiresAtEpochSeconds)) {
    return invalid("Transient enrollment persistence record requires a TTL");
  }

  if (!recordMatchesKey(value, recordType)) {
    return invalid("Enrollment persistence record key does not match its identifier");
  }

  return { ok: true, value: value as EnrollmentPersistenceRecord };
}

function recordMatchesKey(value: Record<string, unknown>, recordType: EnrollmentPersistenceRecord["recordType"]) {
  switch (recordType) {
    case "enrollment":
      return typeof value.enrollmentId === "string" &&
        sameKey(value, enrollmentKey(value.enrollmentId));
    case "otpTransaction":
      return typeof value.transactionDigest === "string" &&
        sameKey(value, otpTransactionKey(value.transactionDigest));
    case "externalOperation":
      return typeof value.operationId === "string" &&
        sameKey(value, externalOperationKey(value.operationId));
    case "launchNonce":
      return typeof value.nonceDigest === "string" &&
        sameKey(value, launchNonceKey(value.nonceDigest));
    case "emailClaim":
      return typeof value.emailFingerprint === "string" &&
        sameKey(value, emailClaimKey(value.emailFingerprint));
    case "stripeCustomerClaim":
      return typeof value.stripeCustomerId === "string" &&
        sameKey(value, stripeCustomerClaimKey(value.stripeCustomerId));
    case "accountEnrollment":
      return typeof value.cognitoSub === "string" &&
        typeof value.enrollmentId === "string" &&
        sameKey(value, accountEnrollmentKey(value.cognitoSub, value.enrollmentId));
    case "accountEnrollmentPointer":
      return typeof value.cognitoSub === "string" &&
        typeof value.enrollmentId === "string" &&
        sameKey(value, accountEnrollmentPointerKey(value.cognitoSub));
    case "portalLinkage":
      return typeof value.cognitoSub === "string" &&
        typeof value.enrollmentId === "string" &&
        sameKey(value, portalLinkageKey(value.cognitoSub));
  }
}

function sameKey(value: Record<string, unknown>, key: EnrollmentPersistenceKey) {
  return value.pk === key.pk && value.sk === key.sk;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function invalid(message: string): EnrollmentRecordValidation {
  return { ok: false, error: { code: "invalid_record", message } };
}
