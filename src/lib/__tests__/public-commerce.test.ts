import { afterEach, describe, expect, it, vi } from "vitest";
import { accountHref, checkoutHref, onboardingHref } from "@/lib/public-commerce";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public commerce links", () => {
  it("routes public product CTAs to precheck before payment setup", () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_ORIGIN", "https://account.apoth.example/path-ignored");

    expect(onboardingHref("weight"))
      .toBe("https://account.apoth.example/get-started?product=weight");
  });

  it("routes product checkout to the configured patient-app origin", () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_ORIGIN", "https://account.apoth.example/path-ignored");

    expect(checkoutHref("weight"))
      .toBe("https://account.apoth.example/checkout?product=weight");
  });

  it("rejects unsafe account origins", () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_ORIGIN", "https://user:secret@evil.example");

    expect(accountHref("/checkout?product=weight"))
      .toBe("/checkout?product=weight");
  });

  it("uses the separate patient dev origin when local configuration is absent", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_ORIGIN", "");

    expect(checkoutHref("weight"))
      .toBe("http://127.0.0.1:5173/checkout?product=weight");
  });
});
