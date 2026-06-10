import { usStates } from "@/lib/data";

const US_STATE_CODES = new Set(usStates.map((state) => state.code));

export type StateResidencyInput = {
  state: string;
};

export type StateResidencyResult =
  | { valid: true; normalizedState: string }
  | {
      valid: false;
      normalizedState: string;
      reason: "missing_state" | "invalid_state";
    };

export function validateStateResidency({
  state,
}: StateResidencyInput): StateResidencyResult {
  const normalizedState = normalizeState(state);

  if (!normalizedState) {
    return {
      valid: false,
      normalizedState,
      reason: "missing_state",
    };
  }

  if (!US_STATE_CODES.has(normalizedState)) {
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

function normalizeState(state: string) {
  return state.trim().toUpperCase();
}
