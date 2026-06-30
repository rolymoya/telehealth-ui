import { describe, expect, it } from "vitest";
import {
  currentRequiredConsents,
  evaluateMedicationDisclosureConsentRequirements,
  evaluateMdiConsentRequirements,
  evaluatePrecheckConsentRequirements,
  requiredConsentsForGate,
  requiredConsentsForCurrentOnboarding,
  requiredConsentsForMdi,
  requiredConsentsForPrecheck,
  requiredMedicationDisclosureConsents,
} from "../consents";

describe("consent gate classification", () => {
  it("keeps the launch consent set intact while assigning every document to a gate", () => {
    expect(currentRequiredConsents.map((consent) => consent.consentKind))
      .toEqual([
        "platform_terms",
        "privacy_notice",
        "telehealth_consent",
        "compounded_medication_disclosure",
      ]);
    expect(currentRequiredConsents.every((consent) => consent.gate)).toBe(true);
    expect(requiredConsentsForCurrentOnboarding()).toEqual(currentRequiredConsents);
  });

  it("requires only the privacy notice for the precheck gate", () => {
    expect(requiredConsentsForPrecheck().map((consent) => consent.consentKind))
      .toEqual(["privacy_notice"]);
    expect(requiredConsentsForGate("privacy_notice_before_precheck"))
      .toEqual(requiredConsentsForPrecheck());
  });

  it("requires platform terms and telehealth consent before MDI", () => {
    expect(requiredConsentsForMdi().map((consent) => consent.consentKind))
      .toEqual(["platform_terms", "telehealth_consent"]);
  });

  it("requires compounded medication disclosure only for applicable launch treatments", () => {
    expect(requiredMedicationDisclosureConsents({ treatment: "weight" })
      .map((consent) => consent.consentKind))
      .toEqual(["compounded_medication_disclosure"]);
    expect(requiredMedicationDisclosureConsents({ treatment: "hair" }))
      .toEqual([]);
    expect(requiredMedicationDisclosureConsents({ treatment: "sexual-health" }))
      .toEqual([]);
  });

  it("fails closed for unknown medication-disclosure treatments", () => {
    expect(requiredMedicationDisclosureConsents({ treatment: "unknown" })
      .map((consent) => consent.consentKind))
      .toEqual(["compounded_medication_disclosure"]);
    expect(requiredMedicationDisclosureConsents()
      .map((consent) => consent.consentKind))
      .toEqual(["compounded_medication_disclosure"]);
  });

  it("evaluates evidence against explicit gate-specific document sets", () => {
    const acceptedAt = "2026-06-29T12:00:00.000Z";
    const privacyNotice = currentRequiredConsents.find((consent) =>
      consent.consentKind === "privacy_notice"
    );
    const platformTerms = currentRequiredConsents.find((consent) =>
      consent.consentKind === "platform_terms"
    );
    expect(privacyNotice).toBeDefined();
    expect(platformTerms).toBeDefined();

    const privacyOnly = [{
      acceptedAt,
      consentKind: privacyNotice!.consentKind,
      version: privacyNotice!.version,
    }];

    expect(evaluatePrecheckConsentRequirements(privacyOnly)).toMatchObject({
      accepted: true,
    });
    expect(evaluateMdiConsentRequirements(privacyOnly)).toMatchObject({
      accepted: false,
    });

    expect(evaluateMedicationDisclosureConsentRequirements(
      [{
        acceptedAt,
        consentKind: platformTerms!.consentKind,
        version: platformTerms!.version,
      }],
      { treatment: "hair" },
    )).toMatchObject({
      accepted: true,
      statuses: [],
    });
  });
});
