import { describe, expect, it, vi } from "vitest";
import {
  createEnrollmentAttemptCookie,
  enrollmentAttemptBindingHash,
} from "@/lib/enrollment/attempt-cookie";
import { createEnrollmentRecord } from "@/lib/enrollment/records";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";
import { startEnrollmentEmailOtp } from "@/lib/enrollment/otp-service";
import { otpTransactionDigest } from "@/lib/enrollment/otp-challenge-cookie";

const now = new Date("2026-07-29T01:00:00.000Z");
const signingSecret = { signingSecret: "checkout_signing_secret_at_least_32_bytes" };
const identitySecret = {
  current: {
    keyVersion: 1,
    secret: "identity_fingerprint_secret_at_least_32_bytes",
  },
};

function verifiedSetupEnrollment() {
  return {
    ...createEnrollmentRecord({
      attemptBindingHash: enrollmentAttemptBindingHash("attempt_secret_opaque_001"),
      catalogCode: "catalog_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      expiresAtEpochSeconds: 1_800_003_600,
      now: now.toISOString(),
    }),
    checkout: "completed" as const,
    paymentSetup: "setup_succeeded" as const,
    stripeCheckoutSessionId: "cs_opaque_001",
    stripeCustomerId: "cus_opaque_001",
    stripeSetupIntentId: "seti_opaque_001",
    version: 3,
  };
}

function attemptCookie() {
  return createEnrollmentAttemptCookie({
    attemptSecret: "attempt_secret_opaque_001",
    enrollmentId: "apoth_order_opaque_001",
    now,
    secret: signingSecret,
  });
}

describe("enrollment Cognito email OTP start", () => {
  it("resolves email only from Stripe and stores only its HMAC fingerprint", async () => {
    const repository = createInMemoryEnrollmentRepository([verifiedSetupEnrollment()]);
    const ensurePasswordlessUser = vi.fn().mockResolvedValue({
      ok: true,
      username: "apoth_opaque_cognito_username",
    });
    const startEmailOtp = vi.fn().mockResolvedValue({
      ok: true,
      challengeName: "EMAIL_OTP",
      session: "cognito-session-secret-opaque-value-at-least-20",
    });

    const result = await startEnrollmentEmailOtp({
      attemptCookie: attemptCookie(),
      cognito: { ensurePasswordlessUser, startEmailOtp },
      identitySecret,
      ids: { transactionHandle: () => "otp_handle_opaque_001" },
      now,
      repository,
      signingSecret,
      stripe: {
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            deleted: false,
            email: " Patient+checkout@Example.COM ",
            id: "cus_opaque_001",
          }),
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "verification_code_sent",
      transactionHandle: "otp_handle_opaque_001",
    });
    expect(result.ok && result.challengeCookie).not.toContain("cognito-session-secret");
    expect(ensurePasswordlessUser).toHaveBeenCalledWith({
      email: "patient+checkout@example.com",
      preferredUsername: expect.stringMatching(/^apoth_[0-9a-f]{64}$/),
    });
    expect(startEmailOtp).toHaveBeenCalledWith({
      username: "apoth_opaque_cognito_username",
    });

    const transaction = await repository.getOtpTransaction(
      otpTransactionDigest("otp_handle_opaque_001"),
    );
    expect(transaction).toMatchObject({
      ok: true,
      value: {
        emailFingerprint: expect.stringMatching(/^email_hmac_v1_[0-9a-f]{64}$/),
        emailFingerprintKeyVersion: 1,
        state: "ready",
      },
    });
    expect(JSON.stringify(transaction)).not.toContain("patient+checkout@example.com");
    expect(JSON.stringify(transaction)).not.toContain("cognito-session-secret");
    expect(await repository.getEnrollment("apoth_order_opaque_001")).toMatchObject({
      ok: true,
      value: { identity: "verification_pending", version: 4 },
    });
  });

  it("fails closed before Cognito when signed Stripe payment setup is not ready", async () => {
    const enrollment = {
      ...verifiedSetupEnrollment(),
      paymentSetup: "pending" as const,
    };
    const repository = createInMemoryEnrollmentRepository([enrollment]);
    const ensurePasswordlessUser = vi.fn();

    expect(await startEnrollmentEmailOtp({
      attemptCookie: attemptCookie(),
      cognito: { ensurePasswordlessUser, startEmailOtp: vi.fn() },
      identitySecret,
      now,
      repository,
      signingSecret,
      stripe: { customers: { retrieve: vi.fn() } },
    })).toEqual({ ok: false, code: "verification_not_ready" });
    expect(ensurePasswordlessUser).not.toHaveBeenCalled();
  });
});
