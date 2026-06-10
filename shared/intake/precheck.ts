import {
  isUsStateCode,
  normalizeUsStateCode,
  type UsStateCode,
} from "./us-states";

export const launchOfferingSlugs = [
  "sexual-health",
  "hair",
  "weight",
] as const;

export const offScopeOfferingSlugs = [
  "peptides",
] as const;

export type LaunchOfferingSlug = (typeof launchOfferingSlugs)[number];
export type OffScopeOfferingSlug = (typeof offScopeOfferingSlugs)[number];

export type StateResidencyInput = {
  state: string;
};

export type StateResidencyResult =
  | { valid: true; normalizedState: UsStateCode }
  | {
      valid: false;
      normalizedState: string;
      reason: "missing_state" | "invalid_state";
    };

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

export type IntakePrecheckInput = Record<string, unknown>;

export type IntakePrecheckSuccess = {
  outcome: "eligible_for_intake";
  age: number;
  offering: LaunchOfferingSlug;
  residencyState: UsStateCode;
};

export type IntakePrecheckFailure =
  | {
      outcome: "incomplete";
      reason:
        | "missing_age"
        | "invalid_age"
        | "missing_state"
        | "invalid_state"
        | "missing_offering"
        | "unknown_offering"
        | "missing_emergency_acknowledgement"
        | "missing_contraindication_acknowledgement";
    }
  | { outcome: "ineligible"; reason: "under_18" | "off_scope_offering" }
  | {
      outcome: "needs_clinician_review";
      reason: "emergency_symptoms" | "blocking_contraindication";
    };

export type IntakePrecheckDecision =
  | { ok: true; value: IntakePrecheckSuccess }
  | { ok: false; error: IntakePrecheckFailure };

export function validateStateResidency({
  state,
}: StateResidencyInput): StateResidencyResult {
  const normalizedState = normalizeUsStateCode(state);

  if (!normalizedState) {
    return {
      valid: false,
      normalizedState,
      reason: "missing_state",
    };
  }

  if (!isUsStateCode(normalizedState)) {
    return {
      valid: false,
      normalizedState,
      reason: "invalid_state",
    };
  }

  return {
    valid: true,
    normalizedState,
  };
}

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

export function screenIntakePrecheck(
  input: IntakePrecheckInput,
): IntakePrecheckDecision {
  const age = parseAge(input.age);
  if (age.reason) {
    return { ok: false, error: { outcome: "incomplete", reason: age.reason } };
  }

  const residency = validateStateResidency({ state: stringValue(input.state) });
  if (!residency.valid) {
    return {
      ok: false,
      error: { outcome: "incomplete", reason: residency.reason },
    };
  }

  const offering = parseOffering(input.offering);
  if (!offering.ok) {
    return { ok: false, error: offering.error };
  }

  const emergency = parseYesNo(input.emergencySymptoms);
  if (emergency === null) {
    return {
      ok: false,
      error: {
        outcome: "incomplete",
        reason: "missing_emergency_acknowledgement",
      },
    };
  }

  const contraindication = parseYesNo(input.blockingContraindication);
  if (contraindication === null) {
    return {
      ok: false,
      error: {
        outcome: "incomplete",
        reason: "missing_contraindication_acknowledgement",
      },
    };
  }

  const eligibility = screenLightweightEligibility({
    age: age.value,
    hasEmergencySymptoms: emergency,
    hasBlockingContraindication: contraindication,
  });
  if (eligibility.outcome !== "eligible_for_intake") {
    return { ok: false, error: eligibility };
  }

  return {
    ok: true,
    value: {
      age: age.value,
      offering: offering.value,
      outcome: "eligible_for_intake",
      residencyState: residency.normalizedState,
    },
  };
}

function parseAge(value: unknown):
  | { value: number; reason?: never }
  | { value?: never; reason: "missing_age" | "invalid_age" } {
  const raw = stringValue(value);
  if (!raw) {
    return { reason: "missing_age" };
  }
  if (!/^\d{1,3}$/.test(raw)) {
    return { reason: "invalid_age" };
  }
  const age = Number(raw);
  return Number.isInteger(age) && age >= 1 && age <= 120
    ? { value: age }
    : { reason: "invalid_age" };
}

function parseOffering(value: unknown):
  | { ok: true; value: LaunchOfferingSlug }
  | { ok: false; error: IntakePrecheckFailure } {
  const offering = stringValue(value);
  if (!offering) {
    return {
      ok: false,
      error: { outcome: "incomplete", reason: "missing_offering" },
    };
  }
  if ((launchOfferingSlugs as readonly string[]).includes(offering)) {
    return { ok: true, value: offering as LaunchOfferingSlug };
  }
  if ((offScopeOfferingSlugs as readonly string[]).includes(offering)) {
    return {
      ok: false,
      error: { outcome: "ineligible", reason: "off_scope_offering" },
    };
  }
  return {
    ok: false,
    error: { outcome: "incomplete", reason: "unknown_offering" },
  };
}

function parseYesNo(value: unknown) {
  const normalized = stringValue(value).toLowerCase();
  if (["yes", "true"].includes(normalized)) {
    return true;
  }
  if (["no", "false"].includes(normalized)) {
    return false;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
