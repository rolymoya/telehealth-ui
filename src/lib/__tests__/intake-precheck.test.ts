import { describe, expect, it } from "vitest";
import { screenIntakePrecheck } from "../../../shared/intake/precheck";
import { usStates } from "../../../shared/intake/us-states";

describe("intake precheck", () => {
  it("normalizes all 50 U.S. states without an unsupported-state allowlist", () => {
    expect(usStates).toHaveLength(50);
    expect(screenIntakePrecheck(validInput({ state: " il " }))).toMatchObject({
      ok: true,
      value: {
        residencyState: "IL",
      },
    });
    expect(screenIntakePrecheck(validInput({ state: "CA" }))).toMatchObject({
      ok: true,
      value: {
        residencyState: "CA",
      },
    });
  });

  it.each([
    [{ state: "" }, "missing_state"],
    [{ state: "XX" }, "invalid_state"],
    [{ age: "" }, "missing_age"],
    [{ age: "seventeen" }, "invalid_age"],
    [{ age: "121" }, "invalid_age"],
    [{ offering: "" }, "missing_offering"],
    [{ offering: "unknown" }, "unknown_offering"],
    [{ emergencySymptoms: "" }, "missing_emergency_acknowledgement"],
    [{ blockingContraindication: "" }, "missing_contraindication_acknowledgement"],
  ])("returns bounded incomplete reason %s", (overrides, reason) => {
    expect(screenIntakePrecheck(validInput(overrides))).toEqual({
      ok: false,
      error: {
        outcome: "incomplete",
        reason,
      },
    });
  });

  it.each([
    [{ age: "17" }, { outcome: "ineligible", reason: "under_18" }],
    [{ offering: "peptides" }, { outcome: "ineligible", reason: "off_scope_offering" }],
    [
      { emergencySymptoms: "yes" },
      { outcome: "needs_clinician_review", reason: "emergency_symptoms" },
    ],
    [
      { blockingContraindication: "yes" },
      { outcome: "needs_clinician_review", reason: "blocking_contraindication" },
    ],
  ])("returns bounded failed precheck reason %s", (overrides, error) => {
    expect(screenIntakePrecheck(validInput(overrides))).toEqual({
      ok: false,
      error,
    });
  });
});

function validInput(overrides: Record<string, string> = {}) {
  return {
    age: "34",
    blockingContraindication: "no",
    emergencySymptoms: "no",
    offering: "weight",
    state: "IL",
    ...overrides,
  };
}
