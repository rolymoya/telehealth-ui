// Implemented in T-021: per-condition clinical eligibility
export interface EligibilityInput {
  condition: string;
  responses: Record<string, unknown>;
}

export interface EligibilityResult {
  eligible: boolean;
  mdiPatientCreationAllowed: boolean;
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkEligibility(_input: EligibilityInput): Promise<EligibilityResult> {
  throw new Error("not implemented — T-021");
}
