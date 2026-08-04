import { describe, expect, it } from "vitest";
import {
  applyEnrollmentTransition,
  createPendingEnrollment,
} from "@/lib/enrollment/state-machine";

describe("checkout-as-signup enrollment state machine", () => {
  it("starts with no identity, payment setup, portal access, or billing authority", () => {
    expect(createPendingEnrollment()).toEqual({
      billing: "not_started",
      care: "not_started",
      checkout: "created",
      identity: "unprovisioned",
      paymentSetup: "pending",
      portalHandoff: "unavailable",
    });
  });

  it("accepts payment setup only with signed Stripe-event evidence", () => {
    const enrollment = createPendingEnrollment();

    expect(applyEnrollmentTransition(enrollment, {
      changes: { paymentSetup: "setup_succeeded" },
    })).toMatchObject({
      ok: false,
      error: { code: "missing_stripe_evidence" },
    });

    expect(applyEnrollmentTransition(enrollment, {
      changes: { paymentSetup: "setup_succeeded" },
      evidence: { stripeEventId: "evt_opaque_001" },
    })).toEqual({
      ok: true,
      value: {
        ...enrollment,
        paymentSetup: "setup_succeeded",
      },
    });
  });

  it("does not let a returning sign-in OTP claim an enrollment", () => {
    const enrollment = createPendingEnrollment();

    expect(applyEnrollmentTransition(enrollment, {
      changes: { identity: "verified" },
      evidence: {
        identityVerification: {
          cognitoSub: "cognito-sub-opaque-001",
          mode: "returning_sign_in",
          transactionId: "otp_txn_opaque_001",
        },
      },
    })).toMatchObject({
      ok: false,
      error: { code: "verification_mode_mismatch" },
    });
  });

  it("binds a Cognito subject only after an enrollment-verification OTP", () => {
    const enrollment = createPendingEnrollment();
    const result = applyEnrollmentTransition(enrollment, {
      changes: { identity: "verified" },
      evidence: {
        identityVerification: {
          cognitoSub: "cognito-sub-opaque-001",
          mode: "enrollment_verification",
          transactionId: "otp_txn_opaque_001",
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        ...enrollment,
        cognitoSub: "cognito-sub-opaque-001",
        identity: "verified",
      },
    });
  });

  it("requires verified identity, but not Stripe setup, before portal handoff", () => {
    const enrollment = createPendingEnrollment();

    expect(applyEnrollmentTransition(enrollment, {
      changes: { portalHandoff: "ready" },
    })).toMatchObject({
      ok: false,
      error: { code: "portal_handoff_not_authorized" },
    });

    const result = applyEnrollmentTransition({
      ...enrollment,
      cognitoSub: "cognito-sub-opaque-001",
      identity: "verified",
    }, {
      changes: { portalHandoff: "ready" },
    });

    expect(result).toMatchObject({
      ok: true,
      value: { portalHandoff: "ready" },
    });
  });

  it("never activates billing without clinical approval and an idempotent decision", () => {
    const enrollment = {
      ...createPendingEnrollment(),
      billing: "payment_method_collected" as const,
      care: "clinical_review" as const,
      cognitoSub: "cognito-sub-opaque-001",
      identity: "verified" as const,
      paymentSetup: "setup_succeeded" as const,
    };

    expect(applyEnrollmentTransition(enrollment, {
      changes: { billing: "active" },
    })).toMatchObject({
      ok: false,
      error: { code: "billing_activation_not_authorized" },
    });

    expect(applyEnrollmentTransition({
      ...enrollment,
      care: "billing_ready",
      portalCaseId: "portal_case_opaque_001",
    }, {
      changes: { billing: "active" },
      evidence: { billingActivationDecisionId: "activation_opaque_001" },
    })).toMatchObject({
      ok: true,
      value: {
        billing: "active",
        billingActivationDecisionId: "activation_opaque_001",
      },
    });
  });

  it("rejects late activation after decline or cancellation", () => {
    const terminalEnrollment = {
      ...createPendingEnrollment(),
      billing: "canceled" as const,
      care: "declined" as const,
      cognitoSub: "cognito-sub-opaque-001",
      identity: "verified" as const,
      paymentSetup: "setup_succeeded" as const,
      portalCaseId: "portal_case_opaque_001",
    };

    expect(applyEnrollmentTransition(terminalEnrollment, {
      changes: { billing: "active", care: "billing_ready" },
      evidence: { billingActivationDecisionId: "activation_opaque_late" },
    })).toMatchObject({
      ok: false,
      error: { code: "terminal_state_reopened" },
    });
  });
});
