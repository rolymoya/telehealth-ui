import { describe, expect, it, vi } from "vitest";
import {
  confirmPrecheckEmailOtp,
  startPrecheckEmailOtp,
} from "@/lib/enrollment/precheck-otp";
import { otpChallengeCookieName } from "@/lib/enrollment/otp-challenge-cookie";
import { createAnonymousPrecheckContext } from "../../../../shared/intake/anonymous-precheck-context";

const now = new Date("2026-08-04T18:00:00.000Z");
const signingSecret = {
  signingSecret: "test-signing-secret-with-at-least-32-characters",
};
const precheckContext = createAnonymousPrecheckContext({
  now,
  nonce: "synthetic-precheck-nonce-0123456789",
  residencyState: "IL",
  secret: signingSecret,
  selectedTreatment: "weight",
});

describe("passwordless account verification after precheck", () => {
  it("starts and confirms a one-time Cognito email code without storing a password", async () => {
    const cognito = {
      confirmEmailOtp: vi.fn(async () => ({
        ok: true as const,
        accessToken: "opaque-access-token",
        expiresIn: 3600,
        idToken: "opaque-id-token",
      })),
      ensurePasswordlessUser: vi.fn(async (input: {
        email: string;
        preferredUsername: string;
      }) => ({ ok: true as const, username: input.preferredUsername })),
      startEmailOtp: vi.fn(async () => ({
        ok: true as const,
        challengeName: "EMAIL_OTP" as const,
        session: "opaque-cognito-session-at-least-twenty-characters",
      })),
    };
    const started = await startPrecheckEmailOtp({
      cognito,
      email: " Patient@Example.Test ",
      ids: { transactionHandle: () => "otp_handle_0123456789abcdef" },
      now,
      precheckContext,
      signingSecret,
    });
    expect(started).toMatchObject({
      ok: true,
      status: "verification_code_sent",
      transactionHandle: "otp_handle_0123456789abcdef",
    });
    expect(cognito.ensurePasswordlessUser).toHaveBeenCalledWith({
      email: "patient@example.test",
      preferredUsername: expect.stringMatching(/^apoth_[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(cognito.ensurePasswordlessUser.mock.calls)).not.toContain("password");
    if (!started.ok) throw new Error("expected OTP start");

    await expect(confirmPrecheckEmailOtp({
      challengeCookie: started.challengeCookie,
      code: "123456",
      cognito,
      now,
      signingSecret,
      transactionHandle: started.transactionHandle,
      verifyAccessToken: vi.fn(async () => ({ ok: true as const })),
    })).resolves.toEqual({
      ok: true,
      accessToken: "opaque-access-token",
      expiresIn: 3600,
      status: "account_verified",
    });
    expect(cognito.confirmEmailOtp).toHaveBeenCalledWith({
      code: "123456",
      session: "opaque-cognito-session-at-least-twenty-characters",
      username: expect.stringMatching(/^apoth_[a-f0-9]{64}$/),
    });
  });

  it("rejects invalid email, code, or challenge correlation before account access", async () => {
    const cognito = {
      ensurePasswordlessUser: vi.fn(),
      startEmailOtp: vi.fn(),
    };
    await expect(startPrecheckEmailOtp({
      cognito,
      email: "patient@example.test",
      now,
      signingSecret,
    })).resolves.toEqual({ ok: false, code: "precheck_required" });
    expect(cognito.ensurePasswordlessUser).not.toHaveBeenCalled();

    await expect(startPrecheckEmailOtp({
      cognito,
      email: "not-an-email",
      now,
      precheckContext,
      signingSecret,
    })).resolves.toEqual({ ok: false, code: "invalid_email" });
    expect(cognito.ensurePasswordlessUser).not.toHaveBeenCalled();

    await expect(confirmPrecheckEmailOtp({
      challengeCookie: `${otpChallengeCookieName}=invalid`,
      code: "123456",
      cognito: { confirmEmailOtp: vi.fn() },
      now,
      signingSecret,
      transactionHandle: "otp_handle_wrong_0123456789",
      verifyAccessToken: vi.fn(),
    })).resolves.toEqual({ ok: false, code: "invalid_verification" });
  });
});
