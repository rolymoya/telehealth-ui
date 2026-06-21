# MDI Care Workflow Launch Posture

## Decision

For launch, Apoth does not process refills natively and does not call MDI
internal patient-app refill routes. Patients can open the MDI care workflow for
follow-up through the approved messaging workflow when Apoth has opaque MDI
patient and case linkage.

The generated MDI operation
`internal-post-v1-patient-patients-patient-subscriptions-subscription-id-refill-refill-subscription`
is an internal/default-deny surface for Apoth. It is not approved for launch
implementation.

Partner order and voucher reads are also not used as Apoth refill state at
launch. Their response shapes include patient, product, prescription, pharmacy,
order, token, and clinical fields. Apoth must not ingest, store, log, or render
those payloads as native refill or care workflow content.

## Patient-Facing Posture

Product copy may say that patients can open their care workflow to message or
follow up with the care team. Product copy must not promise native Apoth refill
submission, medication management, prescription status, pharmacy selection, or
order tracking.

Allowed launch action codes:

- `open_mdi_care`
- `care_workflow_unavailable`
- `refills_deferred`

Deferred or future-only action codes:

- `open_mdi_refills`
- `follow_up_pending`

Those future codes require a new route validation and thin-PHI review before
they can trigger MDI API calls or dashboard rendering.

## Data Boundary

Allowed local state is limited to Cognito subject, opaque MDI patient/case
linkage, bounded action/reason codes, and existing workflow URL evidence such as
workflow code, request ID, outcome, and timestamps.

Forbidden local state includes medication or product names, doses, directions,
days supply, refills remaining, prescription IDs/details, order payloads,
tracking URLs, pharmacy notes, shipping or address fields, voucher patient
payloads, patient auth tokens, questionnaire answers, clinical notes, raw MDI
responses, and full workflow URLs or tokens.
