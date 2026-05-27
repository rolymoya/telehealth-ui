import { describe, it, expect } from "vitest";
import { isStateSupported } from "@/lib/state-availability";

// Contract: patients from unsupported states cannot proceed to case creation.
// RED until T-020 (state-availability gating) implements isStateSupported.
describe("state-availability gating", () => {
  it("rejects patients from unsupported states", () => {
    expect(isStateSupported("Nebraska")).toBe(false);
  });

  it("allows patients from supported states", () => {
    expect(isStateSupported("California")).toBe(true);
  });
});
