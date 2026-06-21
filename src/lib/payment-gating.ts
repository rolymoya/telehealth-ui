export const BILLING_UNLOCK_EVENT_TYPE = "case_clinically_approved";

export type MdiClinicalEvent = {
  provider: "mdi";
  type: string;
  mdiCaseId?: string;
};

export type BillingState =
  | "payment_method_pending"
  | "payment_method_collected"
  | "subscription_active";

export type BillingUnlockAction =
  | "activate_billing"
  | "await_clinical_review"
  | "await_payment_method"
  | "cancel_active_billing"
  | "cancel_pending_billing"
  | "do_not_charge"
  | "manual_review_required"
  | "no_op"
  | "provider_unavailable";

export type BillingUnlockDenyReason =
  | "already_active"
  | "awaiting_clinical_review"
  | "case_mismatch"
  | "declined"
  | "manual_review_required"
  | "missing_case"
  | "payment_method_not_collected"
  | "provider_mismatch"
  | "provider_unavailable"
  | "unsupported_event";

export type BillingUnlockDecision =
  | {
    canActivate: true;
    action: "activate_billing";
    reason: "selected_unlock_event";
  }
  | {
    canActivate: false;
    action: Exclude<BillingUnlockAction, "activate_billing">;
    reason: BillingUnlockDenyReason;
  };

export type BillingUnlockInput = {
  billingState: BillingState;
  event: MdiClinicalEvent;
  expectedMdiCaseId: string;
};

export function evaluateBillingUnlock(input: BillingUnlockInput): BillingUnlockDecision {
  if (input.event.provider !== "mdi") {
    return deny("provider_mismatch", "do_not_charge");
  }
  if (isProviderUnavailableEvent(input.event.type)) {
    return deny("provider_unavailable", "provider_unavailable");
  }
  if (!input.expectedMdiCaseId || !input.event.mdiCaseId) {
    return deny("missing_case", "do_not_charge");
  }
  if (input.event.mdiCaseId !== input.expectedMdiCaseId) {
    return deny("case_mismatch", "do_not_charge");
  }
  if (isDeclinedEvent(input.event.type)) {
    return input.billingState === "subscription_active"
      ? deny("declined", "cancel_active_billing")
      : deny("declined", "cancel_pending_billing");
  }
  if (isManualReviewEvent(input.event.type)) {
    return deny("manual_review_required", "manual_review_required");
  }
  if (isAwaitingClinicalReviewEvent(input.event.type)) {
    return deny("awaiting_clinical_review", "await_clinical_review");
  }
  if (input.event.type !== BILLING_UNLOCK_EVENT_TYPE) {
    return deny("unsupported_event", "manual_review_required");
  }
  if (input.billingState === "subscription_active") {
    return deny("already_active", "no_op");
  }
  if (input.billingState !== "payment_method_collected") {
    return deny("payment_method_not_collected", "await_payment_method");
  }
  return {
    canActivate: true,
    action: "activate_billing",
    reason: "selected_unlock_event",
  };
}

export function canActivateBilling(
  event: MdiClinicalEvent,
  billingState: BillingState,
  expectedMdiCaseId: string,
): boolean {
  return evaluateBillingUnlock({
    billingState,
    event,
    expectedMdiCaseId,
  }).canActivate;
}

function deny(
  reason: BillingUnlockDenyReason,
  action: Exclude<BillingUnlockAction, "activate_billing">,
): BillingUnlockDecision {
  return {
    canActivate: false,
    action,
    reason,
  };
}

function isAwaitingClinicalReviewEvent(eventType: string) {
  return awaitingClinicalReviewEvents.has(eventType);
}

function isDeclinedEvent(eventType: string) {
  return declinedEvents.has(eventType);
}

function isManualReviewEvent(eventType: string) {
  return manualReviewEvents.has(eventType);
}

function isProviderUnavailableEvent(eventType: string) {
  return providerUnavailableEvents.has(eventType);
}

const awaitingClinicalReviewEvents = new Set([
  "case_assigned_to_clinician",
  "case_created",
  "case_processing",
  "case_waiting",
]);

const manualReviewEvents = new Set([
  "case_approved",
  "case_completed",
  "case_transferred_to_support",
]);

const declinedEvents = new Set([
  "case_cancelled",
  "case_declined",
  "case_denied",
  "case_rejected",
]);

const providerUnavailableEvents = new Set([
  "mdi_maintenance",
  "provider_maintenance",
  "provider_unavailable",
]);
