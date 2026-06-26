export type RefundScenarioCode =
  | "before_clinician_review"
  | "case_not_accepted"
  | "external_refund_event"
  | "after_visit_before_pharmacy_shipment"
  | "after_pharmacy_shipment"
  | "damaged_or_lost_shipment"
  | "post_start_care_change"
  | "patient_subscription_cancellation";

export type RefundStripeAction =
  | "cancel_only"
  | "credit"
  | "full_refund"
  | "manual_review"
  | "no_op"
  | "partial_refund";

export type RefundAutomationMode =
  | "automated"
  | "fail_closed_manual_review"
  | "manual_review";

export type RefundEvidenceCode =
  | "REFUND_ACTION_DECIDED"
  | "REFUND_MANUAL_REVIEW_REQUIRED"
  | "REFUND_STATUS_CHANGED";

export type RefundPatientStatusCode =
  | "cancellation_scheduled"
  | "refund_approved"
  | "refund_completed"
  | "refund_denied"
  | "refund_failed"
  | "refund_not_needed"
  | "refund_pending_review";

export type RefundActionContract = {
  allowedStripeActions: readonly RefundStripeAction[];
  automation: RefundAutomationMode;
  defaultStripeAction: RefundStripeAction;
  evidence: {
    metadata: {
      refund_action: RefundStripeAction;
      refund_scenario: RefundScenarioCode;
      refund_status: RefundPatientStatusCode;
      review_requirement: RefundReviewRequirement;
    };
    summaryCode: RefundEvidenceCode;
  };
  patientStatus: RefundPatientStatusCode;
  requiresAuthoritativeState: readonly RefundReviewRequirement[];
  scenario: RefundScenarioCode;
  supportCopy: string;
};

export type RefundReviewRequirement =
  | "mdi_case_status"
  | "none"
  | "pharmacy_shipment_status"
  | "support_approval";

export function refundActionContract(
  scenario: RefundScenarioCode,
): RefundActionContract {
  return refundActionContracts[scenario];
}

export function refundPatientStatusCopy(status: RefundPatientStatusCode) {
  return refundStatusCopy[status];
}

export const refundActionContracts = {
  before_clinician_review: {
    allowedStripeActions: ["no_op", "full_refund"],
    automation: "automated",
    defaultStripeAction: "full_refund",
    evidence: evidence(
      "REFUND_ACTION_DECIDED",
      "before_clinician_review",
      "full_refund",
      "refund_approved",
      "none",
    ),
    patientStatus: "refund_approved",
    requiresAuthoritativeState: ["none"],
    scenario: "before_clinician_review",
    supportCopy:
      "If a pre-approval billing mistake occurred, Apoth reverses it in full.",
  },
  case_not_accepted: {
    allowedStripeActions: ["cancel_only", "full_refund"],
    automation: "automated",
    defaultStripeAction: "full_refund",
    evidence: evidence(
      "REFUND_ACTION_DECIDED",
      "case_not_accepted",
      "full_refund",
      "refund_approved",
      "mdi_case_status",
    ),
    patientStatus: "refund_approved",
    requiresAuthoritativeState: ["mdi_case_status"],
    scenario: "case_not_accepted",
    supportCopy:
      "Billing is closed and any eligible pre-service payment is reversed.",
  },
  external_refund_event: {
    allowedStripeActions: ["manual_review", "no_op", "full_refund", "partial_refund"],
    automation: "fail_closed_manual_review",
    defaultStripeAction: "manual_review",
    evidence: evidence(
      "REFUND_MANUAL_REVIEW_REQUIRED",
      "external_refund_event",
      "manual_review",
      "refund_pending_review",
      "support_approval",
    ),
    patientStatus: "refund_pending_review",
    requiresAuthoritativeState: ["support_approval"],
    scenario: "external_refund_event",
    supportCopy:
      "Support is reviewing a billing processor update against the account policy.",
  },
  after_visit_before_pharmacy_shipment: {
    allowedStripeActions: ["manual_review", "partial_refund", "credit"],
    automation: "fail_closed_manual_review",
    defaultStripeAction: "manual_review",
    evidence: evidence(
      "REFUND_MANUAL_REVIEW_REQUIRED",
      "after_visit_before_pharmacy_shipment",
      "manual_review",
      "refund_pending_review",
      "pharmacy_shipment_status",
    ),
    patientStatus: "refund_pending_review",
    requiresAuthoritativeState: ["pharmacy_shipment_status", "support_approval"],
    scenario: "after_visit_before_pharmacy_shipment",
    supportCopy:
      "Support reviews whether a separable medication amount can be refunded or credited.",
  },
  after_pharmacy_shipment: {
    allowedStripeActions: ["manual_review", "no_op", "credit"],
    automation: "fail_closed_manual_review",
    defaultStripeAction: "manual_review",
    evidence: evidence(
      "REFUND_MANUAL_REVIEW_REQUIRED",
      "after_pharmacy_shipment",
      "manual_review",
      "refund_pending_review",
      "pharmacy_shipment_status",
    ),
    patientStatus: "refund_pending_review",
    requiresAuthoritativeState: ["pharmacy_shipment_status", "support_approval"],
    scenario: "after_pharmacy_shipment",
    supportCopy:
      "Support reviews the order outcome before deciding whether any credit is available.",
  },
  damaged_or_lost_shipment: {
    allowedStripeActions: ["manual_review", "full_refund", "partial_refund", "credit"],
    automation: "fail_closed_manual_review",
    defaultStripeAction: "manual_review",
    evidence: evidence(
      "REFUND_MANUAL_REVIEW_REQUIRED",
      "damaged_or_lost_shipment",
      "manual_review",
      "refund_pending_review",
      "pharmacy_shipment_status",
    ),
    patientStatus: "refund_pending_review",
    requiresAuthoritativeState: ["pharmacy_shipment_status", "support_approval"],
    scenario: "damaged_or_lost_shipment",
    supportCopy:
      "Support reviews fulfillment evidence and coordinates the approved correction.",
  },
  post_start_care_change: {
    allowedStripeActions: ["manual_review", "partial_refund", "credit", "no_op"],
    automation: "fail_closed_manual_review",
    defaultStripeAction: "manual_review",
    evidence: evidence(
      "REFUND_MANUAL_REVIEW_REQUIRED",
      "post_start_care_change",
      "manual_review",
      "refund_pending_review",
      "mdi_case_status",
    ),
    patientStatus: "refund_pending_review",
    requiresAuthoritativeState: ["mdi_case_status", "support_approval"],
    scenario: "post_start_care_change",
    supportCopy:
      "Support reviews the account with the care workflow outcome before deciding any credit.",
  },
  patient_subscription_cancellation: {
    allowedStripeActions: ["cancel_only"],
    automation: "automated",
    defaultStripeAction: "cancel_only",
    evidence: evidence(
      "REFUND_ACTION_DECIDED",
      "patient_subscription_cancellation",
      "cancel_only",
      "cancellation_scheduled",
      "none",
    ),
    patientStatus: "cancellation_scheduled",
    requiresAuthoritativeState: ["none"],
    scenario: "patient_subscription_cancellation",
    supportCopy:
      "Cancellation is scheduled for the end of the current billing cycle.",
  },
} satisfies Record<RefundScenarioCode, RefundActionContract>;

const refundStatusCopy = {
  cancellation_scheduled: {
    label: "Cancellation scheduled",
    summary: "Your subscription is set to end at the close of the current billing cycle.",
  },
  refund_approved: {
    label: "Refund approved",
    summary: "The approved refund will be returned to the original payment method.",
  },
  refund_completed: {
    label: "Refund completed",
    summary: "The approved refund has been submitted to the payment processor.",
  },
  refund_denied: {
    label: "Refund not approved",
    summary: "Support reviewed the request and no refund is available under the policy.",
  },
  refund_failed: {
    label: "Refund needs support",
    summary: "The refund could not be completed automatically. Support will review it.",
  },
  refund_not_needed: {
    label: "No refund needed",
    summary: "No eligible payment needs to be refunded for this account state.",
  },
  refund_pending_review: {
    label: "Refund under review",
    summary: "Support is reviewing the billing request with the required source-system status.",
  },
} satisfies Record<RefundPatientStatusCode, { label: string; summary: string }>;

function evidence(
  summaryCode: RefundEvidenceCode,
  scenario: RefundScenarioCode,
  action: RefundStripeAction,
  status: RefundPatientStatusCode,
  reviewRequirement: RefundReviewRequirement,
): RefundActionContract["evidence"] {
  return {
    metadata: {
      refund_action: action,
      refund_scenario: scenario,
      refund_status: status,
      review_requirement: reviewRequirement,
    },
    summaryCode,
  };
}
