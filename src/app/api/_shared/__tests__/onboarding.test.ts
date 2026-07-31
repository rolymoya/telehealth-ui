import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameOriginMutation } from "@/app/api/_shared/onboarding";

describe("same-origin mutation guard", () => {
  it("uses nextUrl for direct requests without proxy headers", () => {
    const request = new NextRequest("https://account.apoth.example/api/enrollment/checkout", {
      headers: { origin: "https://account.apoth.example" },
      method: "POST",
    });

    expect(isSameOriginMutation(request)).toBe(true);
  });

  it("uses the forwarded public origin when Next normalizes nextUrl to localhost", () => {
    const request = new NextRequest("http://localhost:3000/api/enrollment/checkout", {
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-host": "127.0.0.1:3000",
        "x-forwarded-proto": "http",
      },
      method: "POST",
    });

    expect(isSameOriginMutation(request)).toBe(true);
  });

  it("rejects a foreign browser origin", () => {
    const request = new NextRequest("https://internal.example/api/enrollment/checkout", {
      headers: {
        host: "internal.example",
        origin: "https://evil.example",
        "x-forwarded-host": "account.apoth.example",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    expect(isSameOriginMutation(request)).toBe(false);
  });

  it("fails closed for ambiguous forwarded hosts", () => {
    const request = new NextRequest("https://internal.example/api/enrollment/checkout", {
      headers: {
        host: "internal.example",
        origin: "https://account.apoth.example",
        "x-forwarded-host": "account.apoth.example, evil.example",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    expect(isSameOriginMutation(request)).toBe(false);
  });
});
