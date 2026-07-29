import { describe, expect, it, vi } from "vitest";
import {
  createEnrollmentAttemptCookie,
  enrollmentAttemptBindingHash,
} from "@/lib/enrollment/attempt-cookie";
import {
  createOtpChallengeCookie,
  otpChallengeCorrelationHash,
  otpTransactionDigest,
} from "@/lib/enrollment/otp-challenge-cookie";
import {
  createEnrollmentRecord,
  createOtpTransactionRecord,
} from "@/lib/enrollment/records";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";
import { confirmEnrollmentEmailOtp } from "@/lib/enrollment/otp-confirmation";

const now = new Date("2026-07-29T01:00:00.000Z");
const signingSecret = { signingSecret: "checkout_signing_secret_at_least_32_bytes" };
const cognitoSession = "cognito-session-secret-opaque-value-at-least-20";
const transactionHandle = "otp_handle_opaque_001";

function enrollment() {
  return {
    ...createEnrollmentRecord({
      attemptBindingHash: enrollmentAttemptBindingHash("attempt_secret_opaque_001"),
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now: now.toISOString(),
    }),
    checkout: "completed" as const,
    identity: "verification_pending" as const,
    paymentSetup: "setup_succeeded" as const,
    stripeCheckoutSessionId: "cs_opaque_001",
    stripeCustomerId: "cus_opaque_001",
    stripeSetupIntentId: "seti_opaque_001",
    version: 4,
  };
}

function transaction() {
  return createOtpTransactionRecord({
    challengeCorrelationHash: otpChallengeCorrelationHash(cognitoSession),
    cognitoUsername: "apoth_opaque_cognito_username",
    emailFingerprint: "email_hmac_v1_opaque_001",
    emailFingerprintKeyVersion: 1,
    enrollmentId: "apoth_order_opaque_001",
    expiresAtEpochSeconds: 1_800_003_600,
    mode: "enrollment_verification",
    now: now.toISOString(),
    stripeCheckoutSessionId: "cs_opaque_001",
    stripeCustomerId: "cus_opaque_001",
    transactionDigest: otpTransactionDigest(transactionHandle),
  });
}

function cookies() {
  return {
    attemptCookie: createEnrollmentAttemptCookie({
      attemptSecret: "attempt_secret_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      now,
      secret: signingSecret,
    }),
    challengeCookie: createOtpChallengeCookie({
      cognitoSession,
      cognitoUsername: "apoth_opaque_cognito_username",
      iv: Buffer.alloc(12, 9),
      now,
      secret: signingSecret,
      transactionHandle,
    }),
  };
}

describe("enrollment Cognito email OTP confirmation", () => {
  it("verifies the Cognito token then atomically binds account and commerce records", async () => {
    const repository = createInMemoryEnrollmentRepository([enrollment(), transaction()]);
    const confirmEmailOtp = vi.fn().mockResolvedValue({
      ok: true,
      accessToken: "verified-access-token",
      idToken: "verified-id-token",
      expiresIn: 3600,
    });
    const verifyAccessToken = vi.fn().mockResolvedValue({
      ok: true,
      cognitoSub: "cognito-sub-opaque-001",
    });

    const result = await confirmEnrollmentEmailOtp({
      ...cookies(),
      code: "123456",
      cognito: { confirmEmailOtp },
      now: new Date("2026-07-29T01:05:00.000Z"),
      repository,
      signingSecret,
      transactionHandle,
      verifyAccessToken,
    });

    expect(result).toEqual({
      ok: true,
      status: "account_created",
      accessToken: "verified-access-token",
      expiresIn: 3600,
    });
    expect(confirmEmailOtp).toHaveBeenCalledWith({
      code: "123456",
      session: cognitoSession,
      username: "apoth_opaque_cognito_username",
    });
    expect(await repository.getEnrollment("apoth_order_opaque_001")).toMatchObject({
      ok: true,
      value: {
        billing: "payment_method_collected",
        cognitoSub: "cognito-sub-opaque-001",
        identity: "verified",
      },
    });
  });

  it("does not mix a handle from another OTP transaction", async () => {
    const repository = createInMemoryEnrollmentRepository([enrollment(), transaction()]);
    const confirmEmailOtp = vi.fn();

    expect(await confirmEnrollmentEmailOtp({
      ...cookies(),
      code: "123456",
      cognito: { confirmEmailOtp },
      now: new Date("2026-07-29T01:05:00.000Z"),
      repository,
      signingSecret,
      transactionHandle: "otp_handle_other_001",
      verifyAccessToken: vi.fn(),
    })).toEqual({ ok: false, code: "invalid_verification" });
    expect(confirmEmailOtp).not.toHaveBeenCalled();
  });
});
