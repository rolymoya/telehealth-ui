export type EvidenceEventCategory =
  | "consent"
  | "mdi_handoff"
  | "stripe_billing"
  | "webhook"
  | "support_admin"
  | "auth";

export type EvidenceActorType = "patient" | "system" | "admin" | "vendor" | "cognito";

export type EvidenceEventStatus = "recorded" | "succeeded" | "failed" | "skipped";

export type EvidenceLinkageRequirement =
  | "mdi_case"
  | "mdi_failure"
  | "stripe_customer"
  | "stripe_subscription"
  | "webhook"
  | "webhook_side_effect";

export const evidenceEventSchema = {
  consent_granted: {
    category: "consent",
    summaryCode: "CONSENT_GRANTED",
    statuses: ["succeeded"],
    metadata: { version: ["terms-2026-06-04"] },
  },
  consent_reprompted: {
    category: "consent",
    summaryCode: "CONSENT_REPROMPTED",
    statuses: ["recorded"],
    metadata: { version: ["terms-2026-06-04"] },
  },
  mdi_handoff_submitted: {
    category: "mdi_handoff",
    summaryCode: "MDI_HANDOFF_SUBMITTED",
    statuses: ["succeeded"],
    metadata: { status: ["submitted"] },
    linkage: "mdi_case",
  },
  mdi_handoff_failed: {
    category: "mdi_handoff",
    summaryCode: "MDI_HANDOFF_FAILED",
    statuses: ["failed"],
    metadata: {
      status: ["failed"],
      reason_code: ["MDI_UNAVAILABLE", "MDI_TIMEOUT", "MDI_VALIDATION_FAILED"],
    },
    linkage: "mdi_failure",
  },
  mdi_status_updated: {
    category: "mdi_handoff",
    summaryCode: "MDI_STATUS_UPDATED",
    statuses: ["recorded"],
    metadata: { status: ["clinical_review", "completed", "declined", "cancelled"] },
    linkage: "mdi_case",
  },
  stripe_payment_method_collected: {
    category: "stripe_billing",
    summaryCode: "STRIPE_PAYMENT_METHOD_COLLECTED",
    statuses: ["succeeded"],
    metadata: { status: ["payment_method_collected"] },
    linkage: "stripe_customer",
  },
  stripe_billing_activated: {
    category: "stripe_billing",
    summaryCode: "STRIPE_BILLING_ACTIVATED",
    statuses: ["succeeded"],
    metadata: { status: ["active"] },
    linkage: "stripe_subscription",
  },
  stripe_billing_status_changed: {
    category: "stripe_billing",
    summaryCode: "STRIPE_BILLING_STATUS_CHANGED",
    statuses: ["recorded"],
    metadata: {
      status: [
        "payment_method_pending",
        "payment_method_collected",
        "active",
        "past_due",
        "canceled",
      ],
      previous_status: [
        "not_started",
        "payment_method_pending",
        "payment_method_collected",
        "active",
        "past_due",
        "canceled",
      ],
    },
    linkage: "stripe_subscription",
  },
  webhook_claimed: {
    category: "webhook",
    summaryCode: "WEBHOOK_CLAIMED",
    statuses: ["recorded"],
    metadata: {
      outcome: [
        "claimed",
        "already_processing",
        "already_processed",
        "failed_retryable",
        "retry_not_due",
        "queue_owned_retry",
        "stale_queue_delivery",
        "processing_lease_expired",
        "retry_exhausted",
        "conflict",
      ],
    },
    linkage: "webhook",
  },
  webhook_processed: {
    category: "webhook",
    summaryCode: "WEBHOOK_PROCESSED",
    statuses: ["succeeded"],
    metadata: { outcome: ["processed", "skipped_duplicate"] },
    linkage: "webhook",
  },
  webhook_failed: {
    category: "webhook",
    summaryCode: "WEBHOOK_FAILED",
    statuses: ["failed"],
    metadata: {
      reason_code: ["SIGNATURE_INVALID", "HANDLER_FAILED", "RETRYABLE_FAILURE", "TERMINAL_FAILURE"],
    },
    linkage: "webhook",
  },
  webhook_side_effect_applied: {
    category: "webhook",
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    statuses: ["succeeded", "skipped"],
    metadata: {
      side_effect: [
        "billing_status_update",
        "mdi_status_update",
        "consent_status_update",
        "webhook_idempotency_update",
      ],
    },
    linkage: "webhook_side_effect",
  },
  support_action_recorded: {
    category: "support_admin",
    summaryCode: "SUPPORT_ACTION_RECORDED",
    statuses: ["recorded"],
    metadata: { action_code: ["case_lookup", "status_review", "consent_export"] },
  },
  admin_action_recorded: {
    category: "support_admin",
    summaryCode: "ADMIN_ACTION_RECORDED",
    statuses: ["recorded"],
    metadata: { action_code: ["status_override", "linkage_review", "safe_replay"] },
  },
  auth_sign_in: {
    category: "auth",
    summaryCode: "AUTH_SIGN_IN",
    statuses: ["succeeded", "failed"],
    metadata: { outcome: ["succeeded", "failed"] },
  },
  auth_sign_up: {
    category: "auth",
    summaryCode: "AUTH_SIGN_UP",
    statuses: ["succeeded", "failed"],
    metadata: { outcome: ["succeeded", "failed"] },
  },
  auth_mfa_changed: {
    category: "auth",
    summaryCode: "AUTH_MFA_CHANGED",
    statuses: ["recorded"],
    metadata: { outcome: ["enabled", "disabled"] },
  },
  auth_password_reset: {
    category: "auth",
    summaryCode: "AUTH_PASSWORD_RESET",
    statuses: ["recorded", "succeeded"],
    metadata: { outcome: ["requested", "completed"] },
  },
} as const satisfies Record<string, {
  category: EvidenceEventCategory;
  summaryCode: string;
  statuses: readonly EvidenceEventStatus[];
  metadata: Record<string, readonly string[]>;
  linkage?: EvidenceLinkageRequirement;
}>;

export type EvidenceEventType = keyof typeof evidenceEventSchema;

export type EvidenceEventMetadataValue = string;

export type EvidenceEventMetadata = Record<string, EvidenceEventMetadataValue>;
