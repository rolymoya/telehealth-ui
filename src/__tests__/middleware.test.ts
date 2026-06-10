import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../proxy";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import { e2eAuthHeaderName } from "@/lib/e2e-auth";

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

  it("allows the explicit non-production E2E auth seam through", () => {
    const request = new NextRequest("https://apoth.test/dashboard", {
      headers: {
        [e2eAuthHeaderName]: "opaque-local-e2e-token",
      },
    });

    expect(proxy(request, {
      APOTH_E2E_AUTH_ENABLED: "1",
      APOTH_E2E_AUTH_TOKEN: "opaque-local-e2e-token",
      NODE_ENV: "development",
    }).status).toBe(200);
  });

  it("does not allow the E2E auth seam in production", () => {
    const request = new NextRequest("https://apoth.test/dashboard", {
      headers: {
        [e2eAuthHeaderName]: "opaque-local-e2e-token",
      },
    });

    expect(proxy(request, {
      APOTH_E2E_AUTH_ENABLED: "1",
      APOTH_E2E_AUTH_TOKEN: "opaque-local-e2e-token",
      NODE_ENV: "production",
    }).status).toBe(307);
  });
});
