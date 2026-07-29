import { describe, expect, it } from "vitest";
import {
  createSyntheticPortalProvider,
  validatePortalLaunchUrl,
} from "@/lib/enrollment/portal-provider";
import { resolvePortalRuntimeConfig } from "@/lib/enrollment/portal-runtime";

describe("portal provider boundary", () => {
  it("creates deterministic synthetic opaque pointers without patient data in URLs", async () => {
    const provider = createSyntheticPortalProvider({
      launchOrigin: "https://care.staging.apothhealth.com",
    });
    const provisioned = await provider.provisionPatient({
      patientReference: "cognito-sub-123",
      enrollmentReference: "enrollment-123",
      catalogReference: "catalog_weight_internal",
      idempotencyKey: "provision-key",
    });
    expect(provisioned.ok).toBe(true);
    if (!provisioned.ok) return;

    const launch = await provider.mintPatientLaunch({
      providerPatientId: provisioned.value.providerPatientId,
      providerCaseId: provisioned.value.providerCaseId,
      returnOrigin: "https://account.apothhealth.com",
      idempotencyKey: "launch-key",
    });
    expect(launch.ok).toBe(true);
    if (!launch.ok) return;

    expect(launch.value.launchUrl).toMatch(
      /^https:\/\/care\.staging\.apothhealth\.com\/session\/synthetic_launch_/,
    );
    expect(launch.value.launchUrl).not.toContain("cognito-sub-123");
    expect(launch.value.launchUrl).not.toContain("catalog_weight_internal");
  });

  it("rejects non-HTTPS, credentialed, fragmented, and unapproved launch URLs", () => {
    const allowed = new Set(["https://care.apothhealth.com"]);
    expect(validatePortalLaunchUrl("http://care.apothhealth.com/session/a", allowed)).toBeNull();
    expect(validatePortalLaunchUrl("https://user:pass@care.apothhealth.com/a", allowed)).toBeNull();
    expect(validatePortalLaunchUrl("https://care.apothhealth.com/a#token", allowed)).toBeNull();
    expect(validatePortalLaunchUrl("https://evil.example/a", allowed)).toBeNull();
    expect(validatePortalLaunchUrl("https://care.apothhealth.com/session/a", allowed))
      .toBe("https://care.apothhealth.com/session/a");
  });

  it("keeps the synthetic adapter disabled in production", () => {
    expect(resolvePortalRuntimeConfig({
      APOTH_ACCOUNT_ORIGIN: "https://account.apothhealth.com",
      APOTH_PORTAL_LAUNCH_ENABLED: "true",
      APOTH_PORTAL_LAUNCH_ORIGIN: "https://care.apothhealth.com",
      APOTH_PORTAL_PROVIDER: "synthetic",
      APOTH_PORTAL_PROVISIONING_ENABLED: "true",
      APOTH_STAGE: "production",
    }).ok).toBe(false);

    const staging = resolvePortalRuntimeConfig({
      APOTH_ACCOUNT_ORIGIN: "https://account.staging.apothhealth.com",
      APOTH_PORTAL_LAUNCH_ENABLED: "true",
      APOTH_PORTAL_LAUNCH_ORIGIN: "https://care.staging.apothhealth.com",
      APOTH_PORTAL_PROVIDER: "synthetic",
      APOTH_PORTAL_PROVISIONING_ENABLED: "true",
      APOTH_STAGE: "staging",
    });
    expect(staging.ok).toBe(true);
  });
});
