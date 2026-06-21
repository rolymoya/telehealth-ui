# MDI Billing Unlock Contract

## Decision

Stripe billing activation is allowed only after Apoth receives an authenticated,
idempotently processed MDI case event with:

- `provider`: `mdi`
- `type`: `case_clinically_approved`
- `mdiCaseId`: exactly matching the local billing target case
- local billing state: `payment_method_collected`

The launch contract is encoded in `src/lib/payment-gating.ts` as
`BILLING_UNLOCK_EVENT_TYPE`. T-024, T-025, and T-058 must call that contract
before creating a charge, subscription, or billing activation side effect.

## Evidence And Limits

This decision is based on the existing sanitized MDI event catalog and fixture
from T-052:

- `docs/external/mdi-event-catalog.md`
- `tests/fixtures/mdi/case-status-events.json`
- `src/test/fixtures/mdi.ts`

Live MDI sandbox validation is still tracked by T-094. Until T-094 confirms
provider ordering and exact live event names, the billing contract remains
fail-closed: only `case_clinically_approved` unlocks billing. Other status
events may update dashboard/onboarding mirrors, but they do not activate Stripe
billing.

## Event Outcomes

| MDI event/state | Billing decision | Follow-up action |
| --- | --- | --- |
| `case_clinically_approved` with matching `mdiCaseId` and `payment_method_collected` | Allow activation | `activate_billing` |
| `case_clinically_approved` for another case | Deny | `do_not_charge` |
| `case_clinically_approved` while payment method is pending | Deny | `await_payment_method` |
| `case_clinically_approved` after subscription is already active | Deny duplicate activation | `no_op` |
| `case_created`, `case_assigned_to_clinician`, `case_processing`, `case_waiting` | Deny | `await_clinical_review` |
| `case_approved`, `case_completed`, `case_transferred_to_support` | Deny until T-094 confirms live semantics | `manual_review_required` |
| `case_cancelled`, `case_declined`, `case_denied`, `case_rejected` before activation | Deny | `cancel_pending_billing` |
| `case_cancelled`, `case_declined`, `case_denied`, `case_rejected` after activation | Deny new activation | `cancel_active_billing` |
| provider maintenance or unavailable status | Deny | `provider_unavailable` |
| unknown/unsupported event | Deny | `manual_review_required` |

T-025 owns the eventual Stripe side effects for `cancel_active_billing`, refund
support, and duplicate activation idempotency. T-078 only defines the contract
and reason/action codes.

## Thin-PHI Rules

The billing unlock evaluator accepts only opaque event and linkage fields. It
must not receive, return, store, log, or forward:

- questionnaire questions or answers;
- condition, diagnosis, symptom, medication, prescription, or clinician-note
  content;
- raw MDI webhook payloads;
- free-text cancellation or decline reasons;
- Stripe payment instrument details.

Stripe metadata remains restricted to opaque identifiers allowed by
`docs/stripe-data-policy.md`. MDI status names and event names are local
workflow gates only and must not be written to Stripe metadata.
