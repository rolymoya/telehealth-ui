export type EnrollmentCheckoutState =
  | "created"
  | "open"
  | "completed"
  | "expired"
  | "abandoned";

export type EnrollmentPaymentSetupState =
  | "pending"
  | "setup_succeeded"
  | "failed"
  | "detached";

export type EnrollmentIdentityState =
  | "unprovisioned"
  | "verification_pending"
  | "verified";

export type PortalHandoffState =
  | "unavailable"
  | "ready"
  | "issued"
  | "launched"
  | "expired";

export type EnrollmentCareState =
  | "not_started"
  | "intake_in_progress"
  | "clinical_review"
  | "billing_ready"
  | "declined"
  | "closed";

export type EnrollmentBillingState =
  | "not_started"
  | "payment_method_pending"
  | "payment_method_collected"
  | "active"
  | "past_due"
  | "cancel_pending"
  | "canceled";

export interface EnrollmentSnapshot {
  checkout: EnrollmentCheckoutState;
  paymentSetup: EnrollmentPaymentSetupState;
  identity: EnrollmentIdentityState;
  portalHandoff: PortalHandoffState;
  care: EnrollmentCareState;
  billing: EnrollmentBillingState;
  cognitoSub?: string;
  portalCaseId?: string;
  billingActivationDecisionId?: string;
}

export type OtpVerificationMode =
  | "enrollment_verification"
  | "returning_sign_in";

export interface EnrollmentTransitionEvidence {
  stripeEventId?: string;
  identityVerification?: {
    transactionId: string;
    mode: OtpVerificationMode;
    cognitoSub: string;
  };
  billingActivationDecisionId?: string;
}

export interface EnrollmentTransition {
  changes: Partial<Pick<
    EnrollmentSnapshot,
    | "checkout"
    | "paymentSetup"
    | "identity"
    | "portalHandoff"
    | "care"
    | "billing"
    | "portalCaseId"
  >>;
  evidence?: EnrollmentTransitionEvidence;
}

export type EnrollmentTransitionErrorCode =
  | "missing_stripe_evidence"
  | "missing_identity_verification"
  | "verification_mode_mismatch"
  | "identity_binding_conflict"
  | "portal_handoff_not_authorized"
  | "payment_method_binding_not_authorized"
  | "billing_activation_not_authorized"
  | "terminal_state_reopened"
  | "state_regression";

export type EnrollmentTransitionResult =
  | { ok: true; value: EnrollmentSnapshot }
  | {
    ok: false;
    error: {
      code: EnrollmentTransitionErrorCode;
      message: string;
    };
  };
