import { describe, expect, it } from "vitest";
import {
  createEnrollmentAttemptCookie,
  enrollmentAttemptBindingHash,
  enrollmentAttemptCookieHeader,
  enrollmentAttemptCookieName,
  verifyEnrollmentAttemptCookie,
} from "@/lib/enrollment/attempt-cookie";

describe("anonymous enrollment attempt cookie", () => {
  const currentSecret = { signingSecret: "current_signing_secret_at_least_32_bytes" };
  const now = new Date("2026-07-29T01:00:00.000Z");

  it("signs an opaque one-hour attempt and emits a host-only secure cookie", () => {
    const value = createEnrollmentAttemptCookie({
      attemptSecret: "attempt_secret_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      now,
      secret: currentSecret,
    });

    expect(verifyEnrollmentAttemptCookie({
      now: new Date("2026-07-29T01:30:00.000Z"),
      secret: currentSecret,
      value,
    })).toEqual({
      ok: true,
      payload: {
        attemptSecret: "attempt_secret_opaque_001",
        enrollmentId: "apoth_order_opaque_001",
        expiresAt: "2026-07-29T02:00:00.000Z",
        issuedAt: "2026-07-29T01:00:00.000Z",
        purpose: "checkout_enrollment",
        schemaVersion: 1,
      },
    });

    expect(enrollmentAttemptCookieHeader(value)).toBe(
      `${enrollmentAttemptCookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`,
    );
  });

  it("compares only a one-way attempt binding outside the cookie", () => {
    expect(enrollmentAttemptBindingHash("attempt_secret_opaque_001")).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(enrollmentAttemptBindingHash("attempt_secret_opaque_001")).not.toContain(
      "attempt_secret_opaque_001",
    );
  });

  it("rejects tampering and expiry but accepts a bounded previous signing key", () => {
    const value = createEnrollmentAttemptCookie({
      attemptSecret: "attempt_secret_opaque_001",
      enrollmentId: "apoth_order_opaque_001",
      now,
      secret: { signingSecret: "previous_signing_secret_at_least_32_bytes" },
    });

    expect(verifyEnrollmentAttemptCookie({
      now: new Date("2026-07-29T01:10:00.000Z"),
      secret: currentSecret,
      value: `${value}tampered`,
    })).toEqual({ ok: false, reason: "invalid" });

    expect(verifyEnrollmentAttemptCookie({
      now: new Date("2026-07-29T02:00:01.000Z"),
      secret: {
        ...currentSecret,
        signingSecretPrevious: "previous_signing_secret_at_least_32_bytes",
        signingSecretPreviousExpiresAt: "2026-07-29T03:00:00.000Z",
      },
      value,
    })).toEqual({ ok: false, reason: "expired" });

    expect(verifyEnrollmentAttemptCookie({
      now: new Date("2026-07-29T01:10:00.000Z"),
      secret: {
        ...currentSecret,
        signingSecretPrevious: "previous_signing_secret_at_least_32_bytes",
        signingSecretPreviousExpiresAt: "2026-07-29T01:20:00.000Z",
      },
      value,
    })).toMatchObject({ ok: true });
  });
});
