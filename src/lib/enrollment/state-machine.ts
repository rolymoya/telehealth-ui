import type {
  EnrollmentSnapshot,
  EnrollmentTransition,
  EnrollmentTransitionErrorCode,
  EnrollmentTransitionResult,
} from "@/lib/enrollment/contracts";

export function createPendingEnrollment(): EnrollmentSnapshot {
  return {
    billing: "not_started",
    care: "not_started",
    checkout: "created",
    identity: "unprovisioned",
    paymentSetup: "pending",
    portalHandoff: "unavailable",
  };
}

export function applyEnrollmentTransition(
  current: EnrollmentSnapshot,
  transition: EnrollmentTransition,
): EnrollmentTransitionResult {
  const candidate: EnrollmentSnapshot = {
    ...current,
    ...transition.changes,
  };

  if (reopensTerminalState(current, candidate)) {
    return err(
      "terminal_state_reopened",
      "A declined, closed, or canceled enrollment cannot be reactivated",
    );
  }

  if (
    current.paymentSetup !== "setup_succeeded" &&
    candidate.paymentSetup === "setup_succeeded" &&
    !nonEmpty(transition.evidence?.stripeEventId)
  ) {
    return err(
      "missing_stripe_evidence",
      "Payment setup requires evidence from a verified Stripe event",
    );
  }

  if (current.identity !== "verified" && candidate.identity === "verified") {
    const verification = transition.evidence?.identityVerification;
    if (!verification || !nonEmpty(verification.transactionId) || !nonEmpty(verification.cognitoSub)) {
      return err(
        "missing_identity_verification",
        "Identity binding requires a consumed OTP verification transaction",
      );
    }
    if (verification.mode !== "enrollment_verification") {
      return err(
        "verification_mode_mismatch",
        "A returning sign-in transaction cannot bind an enrollment",
      );
    }
    candidate.cognitoSub = verification.cognitoSub;
  }

  if (
    candidate.identity === "verified" &&
    (!nonEmpty(candidate.cognitoSub) ||
      (nonEmpty(current.cognitoSub) && candidate.cognitoSub !== current.cognitoSub))
  ) {
    return err(
      "identity_binding_conflict",
      "Verified identity must preserve one stable Cognito subject",
    );
  }

  if (
    candidate.portalHandoff !== "unavailable" &&
    (candidate.identity !== "verified" || candidate.paymentSetup !== "setup_succeeded")
  ) {
    return err(
      "portal_handoff_not_authorized",
      "Portal handoff requires verified identity and successful payment setup",
    );
  }

  if (
    candidate.billing === "payment_method_collected" &&
    (candidate.identity !== "verified" || candidate.paymentSetup !== "setup_succeeded")
  ) {
    return err(
      "payment_method_binding_not_authorized",
      "Account billing cannot adopt an anonymous payment method before verified binding",
    );
  }

  if (current.billing !== "active" && candidate.billing === "active") {
    const decisionId = transition.evidence?.billingActivationDecisionId;
    if (
      candidate.care !== "billing_ready" ||
      current.billing !== "payment_method_collected" ||
      !nonEmpty(candidate.portalCaseId) ||
      !nonEmpty(decisionId)
    ) {
      return err(
        "billing_activation_not_authorized",
        "Billing activation requires clinical approval, a bound payment method, a case, and an idempotent decision",
      );
    }
    candidate.billingActivationDecisionId = decisionId;
  }

  if (!statesAdvance(current, candidate)) {
    return err(
      "state_regression",
      "Enrollment state changes must follow an allowed forward transition",
    );
  }

  return { ok: true, value: candidate };
}

function reopensTerminalState(
  current: EnrollmentSnapshot,
  candidate: EnrollmentSnapshot,
) {
  return (
    (["declined", "closed"] as const).includes(current.care as "declined" | "closed") &&
      (candidate.care === "billing_ready" || candidate.billing === "active")
  ) || (current.billing === "canceled" && candidate.billing === "active");
}

function statesAdvance(
  current: EnrollmentSnapshot,
  candidate: EnrollmentSnapshot,
) {
  return allowedState(allowedCheckout[current.checkout], candidate.checkout) &&
    allowedState(allowedPaymentSetup[current.paymentSetup], candidate.paymentSetup) &&
    allowedState(allowedIdentity[current.identity], candidate.identity) &&
    allowedState(allowedPortalHandoff[current.portalHandoff], candidate.portalHandoff) &&
    allowedState(allowedCare[current.care], candidate.care) &&
    allowedState(allowedBilling[current.billing], candidate.billing);
}

const allowedCheckout = {
  created: ["created", "open", "completed", "expired", "abandoned"],
  open: ["open", "completed", "expired", "abandoned"],
  completed: ["completed"],
  expired: ["expired"],
  abandoned: ["abandoned"],
} as const;

const allowedPaymentSetup = {
  pending: ["pending", "setup_succeeded", "failed", "detached"],
  setup_succeeded: ["setup_succeeded", "detached"],
  failed: ["failed", "pending", "setup_succeeded", "detached"],
  detached: ["detached"],
} as const;

const allowedIdentity = {
  unprovisioned: ["unprovisioned", "verification_pending", "verified"],
  verification_pending: ["verification_pending", "verified"],
  verified: ["verified"],
} as const;

const allowedPortalHandoff = {
  unavailable: ["unavailable", "ready"],
  ready: ["ready", "issued", "expired"],
  issued: ["issued", "launched", "expired"],
  launched: ["launched"],
  expired: ["expired"],
} as const;

const allowedCare = {
  not_started: ["not_started", "intake_in_progress", "clinical_review", "billing_ready", "declined", "closed"],
  intake_in_progress: ["intake_in_progress", "clinical_review", "billing_ready", "declined", "closed"],
  clinical_review: ["clinical_review", "billing_ready", "declined", "closed"],
  billing_ready: ["billing_ready", "declined", "closed"],
  declined: ["declined"],
  closed: ["closed"],
} as const;

const allowedBilling = {
  not_started: ["not_started", "payment_method_pending", "payment_method_collected"],
  payment_method_pending: ["payment_method_pending", "payment_method_collected", "canceled"],
  payment_method_collected: ["payment_method_collected", "active", "canceled"],
  active: ["active", "past_due", "cancel_pending", "canceled"],
  past_due: ["past_due", "active", "cancel_pending", "canceled"],
  cancel_pending: ["cancel_pending", "canceled"],
  canceled: ["canceled"],
} as const;

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function allowedState(allowed: readonly string[], candidate: string) {
  return allowed.includes(candidate);
}

function err(
  code: EnrollmentTransitionErrorCode,
  message: string,
): EnrollmentTransitionResult {
  return { ok: false, error: { code, message } };
}
