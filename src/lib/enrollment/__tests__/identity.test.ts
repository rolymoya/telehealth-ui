import { describe, expect, it } from "vitest";
import {
  cognitoUsernameForEmail,
  emailFingerprintCandidates,
  normalizeCheckoutEmail,
} from "@/lib/enrollment/identity";

describe("checkout identity derivation", () => {
  const secret = {
    current: { keyVersion: 2, secret: "current_identity_hmac_material_32_bytes" },
    previous: {
      expiresAt: "2026-07-29T02:00:00.000Z",
      keyVersion: 1,
      secret: "previous_identity_hmac_material_32_bytes",
    },
  };

  it("normalizes only whitespace and case, not provider-specific dot or plus rules", () => {
    expect(normalizeCheckoutEmail("  First.Last+care@Example.COM ")).toEqual({
      ok: true,
      value: "first.last+care@example.com",
    });
    expect(normalizeCheckoutEmail("firstlast@example.com")).not.toEqual(
      normalizeCheckoutEmail("first.last@example.com"),
    );
  });

  it("produces versioned, domain-separated fingerprints for dual-read rotation", () => {
    expect(emailFingerprintCandidates({
      email: "patient@example.com",
      now: new Date("2026-07-29T01:00:00.000Z"),
      secret,
    })).toEqual([
      expect.objectContaining({ keyVersion: 2, fingerprint: expect.stringMatching(/^email_hmac_v2_[0-9a-f]{64}$/) }),
      expect.objectContaining({ keyVersion: 1, fingerprint: expect.stringMatching(/^email_hmac_v1_[0-9a-f]{64}$/) }),
    ]);
    expect(cognitoUsernameForEmail({
      email: "patient@example.com",
      secret: secret.current,
    })).toMatch(/^apoth_[0-9a-f]{64}$/);
  });
});
