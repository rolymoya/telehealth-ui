import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingHref } from "@/patient/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("patient public links", () => {
  it("routes marketing links to the configured public origin", () => {
    vi.stubEnv("VITE_MARKETING_ORIGIN", "https://apothhealth.com/path-ignored");

    expect(marketingHref("/privacy")).toBe("https://apothhealth.com/privacy");
  });

  it("keeps links relative when the configured origin is unsafe", () => {
    vi.stubEnv("VITE_MARKETING_ORIGIN", "https://user:secret@evil.example");

    expect(marketingHref("/terms")).toBe("/terms");
  });
});
