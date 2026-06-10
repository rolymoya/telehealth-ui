export type EligibilityInput = {
  age: number;
  hasEmergencySymptoms: boolean;
  hasBlockingContraindication: boolean;
};

export type EligibilityDecision =
  | { outcome: "eligible_for_intake" }
  | { outcome: "ineligible"; reason: "under_18" }
  | {
      outcome: "needs_clinician_review";
      reason: "emergency_symptoms" | "blocking_contraindication";
    };

export function screenLightweightEligibility(
  input: EligibilityInput,
): EligibilityDecision {
  if (input.age < 18) {
    return { outcome: "ineligible", reason: "under_18" };
  }

  if (input.hasEmergencySymptoms) {
    return { outcome: "needs_clinician_review", reason: "emergency_symptoms" };
  }

  if (input.hasBlockingContraindication) {
    return {
      outcome: "needs_clinician_review",
      reason: "blocking_contraindication",
    };
  }

  return { outcome: "eligible_for_intake" };
}
