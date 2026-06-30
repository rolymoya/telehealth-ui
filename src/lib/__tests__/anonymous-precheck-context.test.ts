import { describe, expect, it } from "vitest";
import {
  anonymousPrecheckContextCookieName,
  anonymousPrecheckContextSetCookieHeader,
  createAnonymousPrecheckContext,
  createPrivacyNoticeGateContext,
  currentPrivacyNoticeVersion,
  privacyNoticeGateCookieName,
  privacyNoticeGateSetCookieHeader,
  verifyAnonymousPrecheckContext,
  verifyPrivacyNoticeGateContext,
  type AppSigningSecret,
} from "../../../shared/intake/anonymous-precheck-context";

const now = new Date("2026-06-29T18:00:00.000Z");
const secret: AppSigningSecret = {
  signingSecret: "test-current-signing-secret",
};

describe("anonymous precheck context", () => {
  it("signs and verifies a privacy notice gate context", () => {
    const value = createPrivacyNoticeGateContext({
      nonce: "privacy-nonce",
      now,
      secret,
    });

    expect(verifyPrivacyNoticeGateContext({ now, secret, value })).toEqual({
      ok: true,
      payload: expect.objectContaining({
        nonce: "privacy-nonce",
        privacyNoticeVersion: currentPrivacyNoticeVersion(),
        purpose: "privacy_notice_gate",
      }),
    });
  });

  it("signs and verifies an eligible anonymous precheck context", () => {
    const value = createAnonymousPrecheckContext({
      nonce: "precheck-nonce",
      now,
      residencyState: "IL",
      secret,
      selectedTreatment: "weight",
    });

    expect(verifyAnonymousPrecheckContext({ now, secret, value })).toEqual({
      ok: true,
      payload: expect.objectContaining({
        nonce: "precheck-nonce",
        outcome: "eligible_for_intake",
        residencyState: "IL",
        selectedTreatment: "weight",
      }),
    });
  });

  it("rejects tampered and wrong-purpose context values", () => {
    const privacyValue = createPrivacyNoticeGateContext({ now, secret });
    const precheckValue = createAnonymousPrecheckContext({
      now,
      residencyState: "IL",
      secret,
      selectedTreatment: "weight",
    });

    expect(verifyPrivacyNoticeGateContext({
      now,
      secret,
      value: `${privacyValue.slice(0, -1)}x`,
    })).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPrivacyNoticeGateContext({ now, secret, value: `${privacyValue}.extra` }))
      .toEqual({ ok: false, reason: "invalid" });
    expect(verifyPrivacyNoticeGateContext({ now, secret, value: precheckValue }))
      .toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects expired, future-issued, and overlong contexts", () => {
    const value = createPrivacyNoticeGateContext({ now, secret });
    expect(verifyPrivacyNoticeGateContext({
      now: new Date("2026-06-29T18:31:00.000Z"),
      secret,
      value,
    })).toEqual({ ok: false, reason: "expired" });

    const future = createPrivacyNoticeGateContext({
      now: new Date("2026-06-29T18:05:00.000Z"),
      secret,
    });
    expect(verifyPrivacyNoticeGateContext({ now, secret, value: future }))
      .toEqual({ ok: false, reason: "invalid" });

    const overlong = createAnonymousPrecheckContext({
      now,
      residencyState: "IL",
      secret,
      selectedTreatment: "weight",
    });
    expect(verifyAnonymousPrecheckContext({
      maxAgeSeconds: 60,
      now,
      secret,
      value: overlong,
    }))
      .toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts a previous signing secret only within its rotation window", () => {
    const previousOnly = createPrivacyNoticeGateContext({
      now,
      secret: { signingSecret: "previous-secret" },
    });
    const rotatingSecret: AppSigningSecret = {
      signingSecret: "current-secret",
      signingSecretPrevious: "previous-secret",
      signingSecretPreviousExpiresAt: "2026-06-29T18:10:00.000Z",
    };

    expect(verifyPrivacyNoticeGateContext({
      now,
      secret: rotatingSecret,
      value: previousOnly,
    }).ok).toBe(true);
    expect(verifyPrivacyNoticeGateContext({
      now: new Date("2026-06-29T18:11:00.000Z"),
      secret: rotatingSecret,
      value: previousOnly,
    })).toEqual({ ok: false, reason: "invalid" });
  });

  it("fails closed for stale privacy versions and invalid payload values", () => {
    const stale = createAnonymousPrecheckContext({
      now,
      privacyNoticeVersion: "privacy-old",
      residencyState: "IL",
      secret,
      selectedTreatment: "weight",
    });
    const invalidTreatment = createAnonymousPrecheckContext({
      now,
      residencyState: "IL",
      secret,
      selectedTreatment: "not-launch",
    });

    expect(verifyAnonymousPrecheckContext({ now, secret, value: stale }))
      .toEqual({ ok: false, reason: "invalid" });
    expect(verifyAnonymousPrecheckContext({ now, secret, value: invalidTreatment }))
      .toEqual({ ok: false, reason: "invalid" });
  });

  it("creates strict host cookies without raw clinical answer fields", () => {
    const privacy = createPrivacyNoticeGateContext({ now, secret });
    const precheck = createAnonymousPrecheckContext({
      now,
      residencyState: "IL",
      secret,
      selectedTreatment: "weight",
    });

    expect(privacyNoticeGateSetCookieHeader(privacy)).toContain(
      `${privacyNoticeGateCookieName}=`,
    );
    expect(anonymousPrecheckContextSetCookieHeader(precheck)).toContain(
      `${anonymousPrecheckContextCookieName}=`,
    );
    for (const header of [
      privacyNoticeGateSetCookieHeader(privacy),
      anonymousPrecheckContextSetCookieHeader(precheck),
    ]) {
      expect(header).toContain("Path=/");
      expect(header).toContain("Max-Age=1800");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=Lax");
      expect(header).not.toMatch(/emergency|contraindication|answer|age/);
    }
  });
});
