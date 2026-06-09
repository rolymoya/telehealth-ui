import { describe, expect, it } from "vitest";
import {
  decideProtectedRouteAccess,
  earliestIncompleteOnboardingStep,
  onboardingStepOrder,
  sanitizeReturnToPath,
  signInRedirectFor,
  type OnboardingGateSnapshot,
} from "../onboarding-gates";

const completeSnapshot: OnboardingGateSnapshot = {
  billingStatus: "active",
  consentAccepted: true,
  mdiCaseId: "mdi_case_001",
  mdiPatientId: "mdi_patient_001",
  onboardingStatus: "billing_ready",
};

describe("onboarding route gates", () => {
  it("redirects unauthenticated protected routes to sign-in with a safe return path", () => {
    expect(
      decideProtectedRouteAccess({
        authenticated: false,
        pathname: "/dashboard/cases",
        search: "?tab=current",
      }),
    ).toEqual({
      decision: "redirect",
      reason: "authentication_required",
      destination: "/sign-in?returnTo=%2Fdashboard%2Fcases%3Ftab%3Dcurrent",
    });
  });

  it("rejects malicious or looping return paths", () => {
    expect(sanitizeReturnToPath("https://evil.example/dashboard")).toBeNull();
    expect(sanitizeReturnToPath("//evil.example/dashboard")).toBeNull();
    expect(sanitizeReturnToPath("/sign-in?returnTo=/dashboard")).toBeNull();
    expect(signInRedirectFor("/sign-up")).toBe("/sign-in");
  });

  it("does not include KYC or Persona in the launch gate order", () => {
    expect(onboardingStepOrder.join(" ")).not.toMatch(/kyc|persona/i);
  });

  it("routes missing or incomplete consent to the consent step", () => {
    expect(earliestIncompleteOnboardingStep(null)).toEqual("consent");
    expect(
      earliestIncompleteOnboardingStep({
        ...completeSnapshot,
        consentAccepted: false,
      }),
    ).toEqual("consent");
  });

  it("routes consent-complete patients without intake submission to intake", () => {
    expect(
      earliestIncompleteOnboardingStep({
        consentAccepted: true,
        onboardingStatus: "intake_ready",
      }),
    ).toEqual("intake");
  });

  it("routes MDI handoff gaps to the MDI step", () => {
    expect(
      earliestIncompleteOnboardingStep({
        consentAccepted: true,
        onboardingStatus: "mdi_submitted",
        mdiPatientId: "mdi_patient_001",
      }),
    ).toEqual("mdi");
  });

  it("routes MDI-complete patients without billing status to billing", () => {
    expect(
      earliestIncompleteOnboardingStep({
        consentAccepted: true,
        onboardingStatus: "clinical_review",
        mdiCaseId: "mdi_case_001",
        mdiPatientId: "mdi_patient_001",
      }),
    ).toEqual("billing");
  });

  it("permits dashboard after payment method collection or active billing", () => {
    for (const billingStatus of ["payment_method_collected", "active"] as const) {
      expect(
        decideProtectedRouteAccess({
          authenticated: true,
          pathname: "/dashboard",
          snapshot: {
            ...completeSnapshot,
            billingStatus,
          },
        }),
      ).toEqual({ decision: "allow" });
    }
  });

  it("redirects skip-ahead attempts to the earliest incomplete step", () => {
    expect(
      decideProtectedRouteAccess({
        authenticated: true,
        pathname: "/dashboard",
        snapshot: {
          consentAccepted: true,
          onboardingStatus: "intake_ready",
        },
      }),
    ).toEqual({
      decision: "redirect",
      reason: "onboarding_step_required",
      destination: "/intake",
    });
  });

  it("allows current and earlier onboarding steps", () => {
    const snapshot: OnboardingGateSnapshot = {
      consentAccepted: true,
      onboardingStatus: "clinical_review",
      mdiCaseId: "mdi_case_001",
      mdiPatientId: "mdi_patient_001",
    };

    expect(
      decideProtectedRouteAccess({
        authenticated: true,
        pathname: "/billing",
        snapshot,
      }),
    ).toEqual({ decision: "allow" });
    expect(
      decideProtectedRouteAccess({
        authenticated: true,
        pathname: "/intake",
        snapshot,
      }),
    ).toEqual({ decision: "allow" });
  });
});
