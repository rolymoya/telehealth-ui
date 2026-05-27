import { describe, it, expect } from "vitest";
import { canActivateSubscription } from "@/lib/billing/subscription";

// Contract: no Stripe Subscription reaches `active` status until the associated
// MDI case reaches `completed`. This is the "no card charged before clinical
// confirmation" promise — enforced structurally, not by convention.
// RED until T-024/T-025 implement canActivateSubscription.
describe("payment gate — no charge before clinical confirmation", () => {
  it("blocks subscription activation when case is pending", async () => {
    const result = await canActivateSubscription({
      userId: "usr_test",
      caseStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks subscription activation when case is in_review", async () => {
    const result = await canActivateSubscription({
      userId: "usr_test",
      caseStatus: "in_review",
    });
    expect(result.allowed).toBe(false);
  });

  it("allows subscription activation only when case is completed", async () => {
    const result = await canActivateSubscription({
      userId: "usr_test",
      caseStatus: "completed",
    });
    expect(result.allowed).toBe(true);
  });
});
