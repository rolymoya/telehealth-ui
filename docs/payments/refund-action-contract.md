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
`src/lib/refund-action-contract.ts`. Queued Stripe refund and dispute updates
are normalized by `src/lib/stripe-refund-processing.ts`.

## Matrix

| Terms scenario | Scenario code | Default Stripe action | Automation | Required source state | Patient status |
| --- | --- | --- | --- | --- | --- |
| Before clinician review | `before_clinician_review` | `full_refund` | automated | none | `refund_approved` |
| Clinical denial | `case_not_accepted` | `full_refund` | automated | MDI case status | `refund_approved` |
| External Stripe refund or dispute update | `external_refund_event` | `manual_review` | manual review | support approval | `refund_pending_review` |
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
The queue-facing refund processor consumes a verified Stripe event, resolves the
local account from the Stripe customer pointer, verifies the subscription still
matches local linkage, and records only bounded refund evidence. Duplicate or
out-of-order refund states are skipped without changing billing linkage. Raw
Stripe refund and dispute objects that do not carry customer/subscription
pointers must pass through an explicit resolver seam before evidence is written;
status ordering is scoped to the Stripe refund, charge, or dispute object, not
only to the subscription.

## Cancellation Boundary

Patient subscription cancellation schedules Stripe period-end cancellation and
mirrors `cancel_pending` locally. When an MDI case linkage exists, the billing
service also invokes an explicit MDI cancellation-review action seam exactly
once for the subscription. The launch default is an unsupported/manual-review
adapter because no approved live MDI cancellation endpoint has been selected in
this repository; the evidence and idempotency contract are in place for a future
approved adapter.
