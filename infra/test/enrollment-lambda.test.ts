import { afterEach, describe, expect, it } from "vitest";
import {
  enrollmentOrigin,
} from "../src/lambda/enrollment.js";
import type { ApiGatewayEvent } from "../src/lambda/patient-api.js";

const originalAllowedOrigins = process.env.APOTH_ALLOWED_ORIGINS;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  restoreEnvironmentValue("APOTH_ALLOWED_ORIGINS", originalAllowedOrigins);
  restoreEnvironmentValue("NEXT_PUBLIC_SITE_URL", originalSiteUrl);
});

describe("enrollment checkout origin", () => {
  it("uses the allowed patient-facing Origin instead of the API Gateway host", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.APOTH_ALLOWED_ORIGINS = "https://patient.staging.example";

    expect(enrollmentOrigin(event({
      headers: {
        host: "abc123.execute-api.us-east-1.amazonaws.com",
        origin: "https://patient.staging.example",
        "x-forwarded-proto": "https",
      },
    }))).toBe("https://patient.staging.example");
  });

  it("fails closed for an unapproved patient-facing Origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.APOTH_ALLOWED_ORIGINS = "https://patient.staging.example";

    expect(enrollmentOrigin(event({
      headers: {
        host: "abc123.execute-api.us-east-1.amazonaws.com",
        origin: "https://evil.example",
        "x-forwarded-proto": "https",
      },
    }))).toBeNull();
  });
});

function event(overrides: Partial<ApiGatewayEvent>): ApiGatewayEvent {
  return {
    headers: {},
    requestContext: {
      domainName: "abc123.execute-api.us-east-1.amazonaws.com",
      http: { method: "POST" },
    },
    ...overrides,
  };
}

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
