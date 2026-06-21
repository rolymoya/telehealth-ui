import { describe, expect, it } from "vitest";
import {
  BILLING_UNLOCK_EVENT_TYPE,
  evaluateBillingUnlock,
  type MdiClinicalEvent,
} from "@/lib/payment-gating";

describe("MDI billing unlock contract", () => {
  it("activates billing only for the selected MDI unlock event, collected payment method, and matching case", () => {
    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: mdiEvent(BILLING_UNLOCK_EVENT_TYPE),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: true,
      action: "activate_billing",
      reason: "selected_unlock_event",
    });

    expect(evaluateBillingUnlock({
      billingState: "payment_method_pending",
      event: mdiEvent(BILLING_UNLOCK_EVENT_TYPE),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "await_payment_method",
      reason: "payment_method_not_collected",
    });
  });

  it("denies an unlock event for a different MDI case before activation", () => {
    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: mdiEvent(BILLING_UNLOCK_EVENT_TYPE, "mdi_case_other_001"),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "do_not_charge",
      reason: "case_mismatch",
    });
  });

  it("does not activate billing for earlier or ambiguous MDI case states", () => {
    for (const eventType of [
      "case_created",
      "case_processing",
      "case_waiting",
    ]) {
      expect(evaluateBillingUnlock({
        billingState: "payment_method_collected",
        event: mdiEvent(eventType),
        expectedMdiCaseId,
      })).toEqual({
        canActivate: false,
        action: "await_clinical_review",
        reason: "awaiting_clinical_review",
      });
    }

    for (const eventType of [
      "case_approved",
      "case_completed",
      "case_transferred_to_support",
    ]) {
      expect(evaluateBillingUnlock({
        billingState: "payment_method_collected",
        event: mdiEvent(eventType),
        expectedMdiCaseId,
      })).toEqual({
        canActivate: false,
        action: "manual_review_required",
        reason: "manual_review_required",
      });
    }
  });

  it("separates pre-activation and post-activation cancellation or decline follow-up actions", () => {
    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: mdiEvent("case_cancelled"),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "cancel_pending_billing",
      reason: "declined",
    });

    expect(evaluateBillingUnlock({
      billingState: "subscription_active",
      event: mdiEvent("case_declined"),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "cancel_active_billing",
      reason: "declined",
    });
  });

  it("fails closed for maintenance, provider mismatches, missing case context, unsupported events, and active subscriptions", () => {
    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: { provider: "mdi", type: "mdi_maintenance" },
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "provider_unavailable",
      reason: "provider_unavailable",
    });

    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: { ...mdiEvent(BILLING_UNLOCK_EVENT_TYPE), provider: "stripe" } as unknown as MdiClinicalEvent,
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "do_not_charge",
      reason: "provider_mismatch",
    });

    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: { provider: "mdi", type: BILLING_UNLOCK_EVENT_TYPE },
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "do_not_charge",
      reason: "missing_case",
    });

    expect(evaluateBillingUnlock({
      billingState: "payment_method_collected",
      event: mdiEvent("notification_sent"),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "manual_review_required",
      reason: "unsupported_event",
    });

    expect(evaluateBillingUnlock({
      billingState: "subscription_active",
      event: mdiEvent(BILLING_UNLOCK_EVENT_TYPE),
      expectedMdiCaseId,
    })).toEqual({
      canActivate: false,
      action: "no_op",
      reason: "already_active",
    });
  });
});

const expectedMdiCaseId = "mdi_case_opaque_001";

function mdiEvent(
  type: string,
  mdiCaseId = expectedMdiCaseId,
): MdiClinicalEvent {
  return {
    provider: "mdi",
    type,
    mdiCaseId,
  };
}
