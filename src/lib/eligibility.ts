export interface EligibilityInput {
  condition: string;
  responses: Record<string, unknown>;
}

export interface EligibilityResult {
  eligible: boolean;
  mdiPatientCreationAllowed: boolean;
  reason?: string;
}

// Contraindications by condition. A truthy response to any key blocks eligibility.
const CONTRAINDICATIONS: Record<string, string[]> = {
  "weight-loss": ["pancreatitis_history"],
};

export async function checkEligibility(input: EligibilityInput): Promise<EligibilityResult> {
  const contraindications = CONTRAINDICATIONS[input.condition] ?? [];

  for (const key of contraindications) {
    if (input.responses[key]) {
      return { eligible: false, mdiPatientCreationAllowed: false, reason: `contraindication: ${key}` };
    }
  }

  return { eligible: true, mdiPatientCreationAllowed: true };
}
