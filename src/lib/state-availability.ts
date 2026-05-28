// States where Apoth is currently licensed to operate.
// Legal review required before adding or removing entries (T-028).
const SUPPORTED_STATES = new Set([
  "Alabama",
  "Alaska",
  "Arizona",
  "California",
  "Colorado",
  "Connecticut",
  "Florida",
  "Georgia",
  "Illinois",
  "Indiana",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Missouri",
  "Nevada",
  "New Jersey",
  "New York",
  "North Carolina",
  "Ohio",
  "Oregon",
  "Pennsylvania",
  "Tennessee",
  "Texas",
  "Virginia",
  "Washington",
  "Wisconsin",
]);

export function isStateSupported(state: string): boolean {
  return SUPPORTED_STATES.has(state);
}
