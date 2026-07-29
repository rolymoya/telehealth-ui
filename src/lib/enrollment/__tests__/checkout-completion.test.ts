import { describe, expect, it, vi } from "vitest";
import {
  createEnrollmentAttemptCookie,
  enrollmentAttemptBindingHash,
} from "@/lib/enrollment/attempt-cookie";
import {
  completeEnrollmentCheckoutReturn,
  readEnrollmentCheckoutStatus,
} from "@/lib/enrollment/checkout-completion";
import { createEnrollmentRecord } from "@/lib/enrollment/records";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";

const now = new Date("2026-07-29T01:00:00.000Z");
const secret = { signingSecret: "checkout_signing_secret_at_least_32_bytes" };
const attemptSecret = "attempt_secret_opaque_001";
const enrollmentId = "apoth_order_opaque_001";

function attemptCookie() {
  return createEnrollmentAttemptCookie({
    attemptSecret,
    enrollmentId,
    now,
    secret,
  });
}

function openEnrollment() {
  return {
    ...createEnrollmentRecord({
      attemptBindingHash: enrollmentAttemptBindingHash(attemptSecret),
      catalogCode: "catalog_opaque_001",
      enrollmentId,
      expiresAtEpochSeconds: 1_800_003_600,
      now: now.toISOString(),
    }),
    checkout: "open" as const,
    stripeCheckoutSessionId: "cs_opaque_001",
    version: 2,
  };
}

describe("sanitized enrollment Checkout completion", () => {
  it("validates Stripe server-side but leaves payment readiness to the webhook", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);
    const retrieve = vi.fn().mockResolvedValue({
      client_reference_id: enrollmentId,
      customer: { id: "cus_opaque_001" },
      id: "cs_opaque_001",
      mode: "setup",
      setup_intent: {
        customer: "cus_opaque_001",
        id: "seti_opaque_001",
        status: "succeeded",
      },
      status: "complete",
    });

    expect(await completeEnrollmentCheckoutReturn({
      attemptCookie: attemptCookie(),
      now: new Date("2026-07-29T01:05:00.000Z"),
      repository,
      sessionId: "cs_opaque_001",
      signingSecret: secret,
      stripe: { checkout: { sessions: { retrieve } } },
    })).toEqual({ ok: true });

    expect(retrieve).toHaveBeenCalledWith("cs_opaque_001", {
      expand: ["customer", "setup_intent"],
    });
    expect(await repository.getEnrollment(enrollmentId)).toMatchObject({
      ok: true,
      value: {
        checkout: "completed",
        paymentSetup: "pending",
        stripeCustomerId: "cus_opaque_001",
        stripeSetupIntentId: "seti_opaque_001",
        version: 3,
      },
    });
  });

  it("rejects a session or cookie that is not bound to the enrollment", async () => {
    const repository = createInMemoryEnrollmentRepository([openEnrollment()]);
    const retrieve = vi.fn();

    expect(await completeEnrollmentCheckoutReturn({
      attemptCookie: attemptCookie(),
      now: new Date("2026-07-29T01:05:00.000Z"),
      repository,
      sessionId: "cs_wrong",
      signingSecret: secret,
      stripe: { checkout: { sessions: { retrieve } } },
    })).toEqual({ ok: false, code: "invalid_return" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns only bounded UI states and never Stripe or identity pointers", async () => {
    const enrollment = {
      ...openEnrollment(),
      checkout: "completed" as const,
      paymentSetup: "setup_succeeded" as const,
      stripeCustomerId: "cus_opaque_001",
      stripeSetupIntentId: "seti_opaque_001",
    };
    const repository = createInMemoryEnrollmentRepository([enrollment]);

    const result = await readEnrollmentCheckoutStatus({
      attemptCookie: attemptCookie(),
      now: new Date("2026-07-29T01:05:00.000Z"),
      repository,
      signingSecret: secret,
    });

    expect(result).toEqual({ ok: true, status: "verification_ready" });
    expect(JSON.stringify(result)).not.toContain("cus_");
    expect(JSON.stringify(result)).not.toContain("seti_");
    expect(JSON.stringify(result)).not.toContain("apoth_order_");
  });
});
