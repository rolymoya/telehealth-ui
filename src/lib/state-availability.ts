export type CareCategory = "sexual-health" | "hair" | "weight" | "peptides";

export type StateAvailabilityInput = {
  state: string;
  careCategory: CareCategory;
  supportedStates: readonly string[];
};

export type StateAvailabilityResult = {
  available: boolean;
  normalizedState: string;
  reason?: "unsupported_state";
};

export function checkStateAvailability({
  state,
  supportedStates,
}: StateAvailabilityInput): StateAvailabilityResult {
  const normalizedState = normalizeState(state);
  const supported = new Set(supportedStates.map(normalizeState));

  if (!supported.has(normalizedState)) {
    return {
      available: false,
      normalizedState,
      reason: "unsupported_state",
    };
  }

  return {
    available: true,
    normalizedState,
  };
}

function normalizeState(state: string) {
  return state.trim().toUpperCase();
}
