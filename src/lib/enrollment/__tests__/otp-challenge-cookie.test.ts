import { describe, expect, it } from "vitest";
import {
  createOtpChallengeCookie,
  otpChallengeCookieHeader,
  otpChallengeCookieName,
  otpTransactionDigest,
  verifyOtpChallengeCookie,
} from "@/lib/enrollment/otp-challenge-cookie";

describe("encrypted Cognito OTP challenge cookie", () => {
  const secret = { signingSecret: "current_signing_secret_at_least_32_bytes" };
  const now = new Date("2026-07-29T01:00:00.000Z");

  it("keeps the Cognito challenge session out of JSON and persistence", () => {
    const value = createOtpChallengeCookie({
      cognitoSession: "cognito-session-secret-opaque-value-at-least-20",
      cognitoUsername: "apoth_opaque_username",
      iv: Buffer.alloc(12, 7),
      now,
      secret,
      transactionHandle: "otp_handle_opaque_001",
    });

    expect(value).not.toContain("cognito-session-secret");
    expect(verifyOtpChallengeCookie({
      now: new Date("2026-07-29T01:05:00.000Z"),
      secret,
      value,
    })).toEqual({
      ok: true,
      payload: {
        cognitoSession: "cognito-session-secret-opaque-value-at-least-20",
        cognitoUsername: "apoth_opaque_username",
        expiresAt: "2026-07-29T01:10:00.000Z",
        issuedAt: "2026-07-29T01:00:00.000Z",
        purpose: "cognito_email_otp",
        schemaVersion: 1,
        transactionHandle: "otp_handle_opaque_001",
      },
    });
    expect(otpChallengeCookieHeader(value)).toBe(
      `${otpChallengeCookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Strict`,
    );
    expect(otpTransactionDigest("otp_handle_opaque_001")).toMatch(
      /^otp_digest_[0-9a-f]{64}$/,
    );
  });

  it("rejects tampering and expired challenges", () => {
    const value = createOtpChallengeCookie({
      cognitoSession: "cognito-session-secret-opaque-value-at-least-20",
      cognitoUsername: "apoth_opaque_username",
      iv: Buffer.alloc(12, 8),
      now,
      secret,
      transactionHandle: "otp_handle_opaque_001",
    });
    expect(verifyOtpChallengeCookie({
      now: new Date("2026-07-29T01:05:00.000Z"),
      secret,
      value: `${value}tampered`,
    })).toEqual({ ok: false, reason: "invalid" });
    expect(verifyOtpChallengeCookie({
      now: new Date("2026-07-29T01:10:01.000Z"),
      secret,
      value,
    })).toEqual({ ok: false, reason: "expired" });
  });
});
