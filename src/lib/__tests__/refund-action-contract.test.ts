import { describe, expect, it } from "vitest";
import {
  refundActionContract,
  refundActionContracts,
  refundPatientStatusCopy,
  type RefundScenarioCode,
} from "@/lib/refund-action-contract";

describe("refund action contract", () => {
  it.each([
    [
      "before_clinician_review",
      {
        action: "full_refund",
        automation: "automated",
        status: "refund_approved",
      },
    ],
    [
      "case_not_accepted",
      {
        action: "full_refund",
        automation: "automated",
        status: "refund_approved",
      },
    ],
    [
      "patient_subscription_cancellation",
      {
        action: "cancel_only",
        automation: "automated",
        status: "cancellation_scheduled",
      },
    ],
  ] as const)(
    "maps %s to an automated bounded Stripe action",
    (scenario, expected) => {
      const contract = refundActionContract(scenario);

      expect(contract).toMatchObject({
        automation: expected.automation,
        defaultStripeAction: expected.action,
        patientStatus: expected.status,
      });
      expect(contract.allowedStripeActions).toContain(expected.action);
      expect(contract.evidence.metadata).toEqual({
        refund_action: expected.action,
        refund_scenario: scenario,
        refund_status: expected.status,
        review_requirement: expect.any(String),
      });
    },
  );

  it.each([
    "after_visit_before_pharmacy_shipment",
    "after_pharmacy_shipment",
    "damaged_or_lost_shipment",
    "post_start_care_change",
    "external_refund_event",
  ] as const)(
    "fails closed to manual review for %s until source-system state is available",
    (scenario) => {
      const contract = refundActionContract(scenario);

      expect(contract.automation).toBe("fail_closed_manual_review");
      expect(contract.defaultStripeAction).toBe("manual_review");
      expect(contract.patientStatus).toBe("refund_pending_review");
      expect(contract.evidence.summaryCode).toBe("REFUND_MANUAL_REVIEW_REQUIRED");
      expect(contract.requiresAuthoritativeState).not.toEqual(["none"]);
      expect(contract.requiresAuthoritativeState).toContain("support_approval");
    },
  );

  it("keeps patient-facing refund status copy generic and bounded", () => {
    expect(refundPatientStatusCopy("refund_pending_review")).toEqual({
      label: "Refund under review",
      summary: "Support is reviewing the billing request with the required source-system status.",
    });
    expect(refundPatientStatusCopy("refund_completed")).toEqual({
      label: "Refund completed",
      summary: "The approved refund has been submitted to the payment processor.",
    });
  });

  it("does not encode PHI-shaped text, clinical reason free text, or unsafe Stripe metadata", () => {
    const serialized = JSON.stringify(refundActionContracts).toLowerCase();
    const forbiddenFragments = [
      "semaglutide",
      "tirzepatide",
      "clinical",
      "diagnosis",
      "symptom",
      "questionnaire",
      "answer",
      "clinician note",
      "medical reason",
      "patient_reason",
      "refund_reason",
      "metadata_value",
      "case details",
    ];

    for (const fragment of forbiddenFragments) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("covers every launch refund scenario named by Terms and T-103", () => {
    const expected: RefundScenarioCode[] = [
      "before_clinician_review",
      "case_not_accepted",
      "external_refund_event",
      "after_visit_before_pharmacy_shipment",
      "after_pharmacy_shipment",
      "damaged_or_lost_shipment",
      "post_start_care_change",
      "patient_subscription_cancellation",
    ];

    expect(Object.keys(refundActionContracts).sort()).toEqual([...expected].sort());
  });
});
