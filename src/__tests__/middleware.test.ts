import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../proxy";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";

describe("protected route middleware", () => {
  it("redirects protected routes without an auth cookie to sign in", () => {
    const response = proxy(new NextRequest("https://apoth.test/dashboard?tab=current"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://apoth.test/sign-in?returnTo=%2Fdashboard%3Ftab%3Dcurrent",
    );
  });

  it("allows public routes and protected routes with a session cookie through", () => {
    expect(proxy(new NextRequest("https://apoth.test/privacy")).status).toBe(200);

    const request = new NextRequest("https://apoth.test/dashboard");
    request.cookies.set(patientAccessCookieName, "opaque-token");
    expect(proxy(request).status).toBe(200);
  });
});
