import { describe, expect, it, vi } from "vitest";
import {
  createAccountEnrollmentPointerRecord,
  createEnrollmentRecord,
  type EnrollmentRecord,
} from "@/lib/enrollment/records";
import { createSyntheticPortalProvider, type PortalProvider } from "@/lib/enrollment/portal-provider";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";
import { launchPatientPortal } from "@/lib/enrollment/portal-service";

const now = new Date("2026-07-29T02:00:00.000Z");
const cognitoSub = "11111111-2222-4333-8444-555555555555";

describe("portal launch service", () => {
  it("provisions and redirects a verified account before payment setup", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const result = await launchPatientPortal({
      cognitoSub,
      enrollmentBootstrap: { catalogCode: "catalog_weight_internal" },
      launchEnabled: true,
      provisioningEnabled: true,
      provider: createSyntheticPortalProvider({
        launchOrigin: "https://care.staging.apothhealth.com",
      }),
      repository,
      returnOrigin: "https://account.staging.apothhealth.com",
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.launchUrl).toMatch(
      /^https:\/\/care\.staging\.apothhealth\.com\/session\/synthetic_launch_/,
    );

    const pointer = await repository.getActiveAccountEnrollment(cognitoSub);
    expect(pointer.ok && pointer.value).toBeTruthy();
    const enrollment = await repository.getEnrollment(
      pointer.ok && pointer.value ? pointer.value.enrollmentId : "missing",
    );
    expect(enrollment.ok && enrollment.value).toMatchObject({
      identity: "verified",
      paymentSetup: "pending",
      portalHandoff: "issued",
    });
    expect(enrollment.ok && enrollment.value?.expiresAtEpochSeconds).toBeUndefined();
    const linkage = await repository.getPortalLinkage(cognitoSub);
    expect(linkage.ok && linkage.value).toMatchObject({
      enrollmentId: pointer.ok && pointer.value?.enrollmentId,
      provider: "synthetic",
      state: "ready",
    });
  });

  it("fails closed before calling a provider when no verified binding exists", async () => {
    const provisionPatient = vi.fn();
    const mintPatientLaunch = vi.fn();
    const provider: PortalProvider = {
      providerCode: "test",
      allowedLaunchOrigins: new Set(["https://care.test"]),
      provisionPatient,
      mintPatientLaunch,
    };
    const result = await launchPatientPortal({
      cognitoSub,
      launchEnabled: true,
      provisioningEnabled: true,
      provider,
      repository: createInMemoryEnrollmentRepository(),
      returnOrigin: "https://account.apothhealth.com",
      now,
    });
    expect(result).toEqual({ ok: false, code: "portal_not_authorized" });
    expect(provisionPatient).not.toHaveBeenCalled();
    expect(mintPatientLaunch).not.toHaveBeenCalled();
  });

  it("honors independent provisioning and launch kill switches", async () => {
    const provider = createSyntheticPortalProvider({
      launchOrigin: "https://care.staging.apothhealth.com",
    });
    const launchDisabled = await launchPatientPortal({
      cognitoSub,
      launchEnabled: false,
      provisioningEnabled: true,
      provider,
      repository: seededRepository(),
      returnOrigin: "https://account.staging.apothhealth.com",
      now,
    });
    expect(launchDisabled).toEqual({ ok: false, code: "portal_unavailable" });

    const provisioningDisabled = await launchPatientPortal({
      cognitoSub,
      launchEnabled: true,
      provisioningEnabled: false,
      provider,
      repository: seededRepository(),
      returnOrigin: "https://account.staging.apothhealth.com",
      now,
    });
    expect(provisioningDisabled).toEqual({ ok: false, code: "portal_unavailable" });
  });

  it("does not redirect when the provider returns a URL outside its allowlist", async () => {
    const valid = createSyntheticPortalProvider({
      launchOrigin: "https://care.staging.apothhealth.com",
    });
    const provider: PortalProvider = {
      ...valid,
      mintPatientLaunch: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          launchReference: "launch_reference_123456",
          launchUrl: "https://attacker.example/session/token",
        },
      }),
    };
    const result = await launchPatientPortal({
      cognitoSub,
      launchEnabled: true,
      provisioningEnabled: true,
      provider,
      repository: seededRepository(),
      returnOrigin: "https://account.staging.apothhealth.com",
      now,
    });
    expect(result).toEqual({ ok: false, code: "portal_unavailable" });
  });
});

function seededRepository() {
  const enrollment = verifiedEnrollment();
  return createInMemoryEnrollmentRepository([
    enrollment,
    createAccountEnrollmentPointerRecord({
      cognitoSub,
      enrollmentId: enrollment.enrollmentId,
      now: now.toISOString(),
    }),
  ]);
}

function verifiedEnrollment(): EnrollmentRecord {
  return {
    ...createEnrollmentRecord({
      enrollmentId: "enrollment_1234567890",
      attemptBindingHash: "a".repeat(64),
      catalogCode: "catalog_weight_internal",
      expiresAtEpochSeconds: Math.floor(now.getTime() / 1000) + 3600,
      now: now.toISOString(),
    }),
    billing: "not_started",
    checkout: "created",
    cognitoSub,
    expiresAtEpochSeconds: undefined,
    identity: "verified",
    paymentSetup: "pending",
    version: 5,
  };
}
