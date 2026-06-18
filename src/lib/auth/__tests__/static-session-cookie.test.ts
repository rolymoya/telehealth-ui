import { describe, expect, it } from "vitest";
import {
  authSessionSetCookieHeader,
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../../shared/auth/session-cookie";

describe("static API session cookie contract", () => {
  it("uses host-only secure HttpOnly attributes", () => {
    const header = authSessionSetCookieHeader({
      maxAge: 900,
      value: "token value",
    });

    expect(header).toContain(`${patientAccessCookieName}=token%20value`);
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=900");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toContain("Domain=");
  });

  it("parses cookie headers without exposing token storage to browser code", () => {
    expect(parseCookieHeader("__Host-apoth_access=abc123; theme=light").get(
      patientAccessCookieName,
    )).toBe("abc123");
  });
});
