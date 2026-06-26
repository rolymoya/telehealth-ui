# Refund Action Contract

## Decision

Launch refund handling is a bounded Stripe action matrix. The matrix translates
the Terms refund scenarios into one of these allowed Stripe actions:
`no_op`, `full_refund`, `partial_refund`, `credit`, `cancel_only`, or
`manual_review`.

Apoth may automate only deterministic billing cleanup:

- reverse a mistaken pre-approval charge or eligible pre-service payment in
  full;
- close billing after MDI indicates the case was not accepted when the local mirror proves a
  payment was collected;
- schedule patient subscription cancellation at period end.

Anything that depends on pharmacy shipment state, fulfillment outcome, or care
workflow judgment fails closed to `manual_review` until an authoritative MDI or
pharmacy status exists.

The executable contract lives in
`src/lib/refund-action-contract.ts`.

## Matrix

| Terms scenario | Scenario code | Default Stripe action | Automation | Required source state | Patient status |
| --- | --- | --- | --- | --- | --- |
| Before clinician review | `before_clinician_review` | `full_refund` | automated | none | `refund_approved` |
| Clinical denial | `case_not_accepted` | `full_refund` | automated | MDI case status | `refund_approved` |
| After visit, before pharmacy shipment | `after_visit_before_pharmacy_shipment` | `manual_review` | fail closed | pharmacy shipment status, support approval | `refund_pending_review` |
| After pharmacy shipment | `after_pharmacy_shipment` | `manual_review` | fail closed | pharmacy shipment status, support approval | `refund_pending_review` |
| Damaged or lost shipment | `damaged_or_lost_shipment` | `manual_review` | fail closed | pharmacy shipment status, support approval | `refund_pending_review` |
| Clinical discontinuation | `post_start_care_change` | `manual_review` | fail closed | MDI case status, support approval | `refund_pending_review` |
| Patient subscription cancellation | `patient_subscription_cancellation` | `cancel_only` | automated | none | `cancellation_scheduled` |

## Evidence Contract

Refund evidence metadata is intentionally bounded:

- `refund_scenario`
- `refund_action`
- `refund_status`
- `review_requirement`

Do not store free-text refund reasons, medical context, questionnaire content,
clinician notes, medication names, pharmacy notes, raw Stripe payloads, raw MDI
payloads, payment instruments, or full workflow URLs in refund evidence. Scenario
codes are intentionally neutral workflow labels, not patient-specific reasons.

Stripe metadata continues to follow `docs/stripe-data-policy.md`: opaque IDs
only, no PHI.

## Webhook Boundary

Stripe refund and dispute webhooks stay queued and idempotent at the receiver.
They must not mutate billing linkage inline or overwrite subscription state.
T-027 owns the future worker that consumes those queued events against this
matrix.
