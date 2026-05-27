import { describe, it, expect } from "vitest";
import { checkEligibility } from "@/lib/eligibility";
import type { EligibilityInput } from "@/lib/eligibility";

// Contract: clinical eligibility must pass before an MDI patient record is created.
// RED until T-021 (per-condition eligibility screening) implements checkEligibility.
describe("clinical eligibility gating", () => {
  it("blocks MDI patient creation for contraindicated patients", async () => {
    const input: EligibilityInput = {
      condition: "weight-loss",
      responses: { pancreatitis_history: true },
    };
    const result = await checkEligibility(input);
    expect(result.eligible).toBe(false);
    expect(result.mdiPatientCreationAllowed).toBe(false);
  });

  it("allows MDI patient creation for eligible patients", async () => {
    const input: EligibilityInput = {
      condition: "weight-loss",
      responses: { pancreatitis_history: false, bmi: 32 },
    };
    const result = await checkEligibility(input);
    expect(result.eligible).toBe(true);
    expect(result.mdiPatientCreationAllowed).toBe(true);
  });
});
