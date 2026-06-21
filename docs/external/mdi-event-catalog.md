# MDI Event And Questionnaire Catalog

## Source And Validation Status

This catalog is derived from the local MD Integrations Postman collection at
`docs/external/MD Integrations API.postman_collection.json`. The collection
contains partner API examples for auth, patients, cases, questionnaires,
vouchers, partner charges, files, orders, messages, patient workflow events, and
API status.

Live sandbox validation has not run in this workspace because approved MDI
sandbox credentials were not available through the local environment or the
approved secret contract. The live credential and patient/case lifecycle PoC has
been split to T-094. T-052 records sanitized API/event shapes only.

## Local Persistence Rules

| Data Class | Examples | Apoth Rule |
| --- | --- | --- |
| Clinical PHI | Questionnaire text, questionnaire responses, case files, message bodies, clinical notes, lab/file contents | Transient only while rendering/submitting to MDI. Do not write to DynamoDB, Stripe metadata, logs, analytics, URLs, or fixtures. |
| PHI-adjacent pointers | `mdi_patient_id`, `mdi_case_id`, `mdi_file_id`, `mdi_message_id` | Store only when needed to link Apoth records to MDI. Treat as sensitive app data. |
| Payment-safe opaque IDs | Apoth patient/user IDs, Stripe customer IDs, MDI charge/voucher reference IDs with no clinical labels | May be used for billing orchestration when no health detail is embedded. Stripe metadata must stay opaque. |
| Operational status only | Case status, workflow status, webhook event ID, provider timestamp, retry status, request ID | May be persisted for idempotency, routing, and dashboard state. |
| Secrets | Client credentials, access tokens, webhook signing secrets | Store only in approved secret managers. Never commit or log values. |

Questionnaire responses are discarded after successful MDI submission. Apoth may
retain a submission pointer, case pointer, and operational completion status,
but not the submitted response payload.

## Launch Surface

| Surface | Source Endpoint Or Event | Payload Shape Summary | Ordering Notes | Triage Tier | Apoth Action | Local Persistence | Downstream Tickets |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth token | `POST /partner/auth/token` | Client credential exchange returns access token shape and expiry; errors return operational auth status. | Fetch before partner API calls; refresh before expiry. | P0 | Build MDI token provider and fail closed on auth errors. | No token persistence outside approved secret/cache path; no logs. | T-053, T-054 |
| API status and maintenance | `GET /v1/status/:plataform`, maintenance/error responses | Status, request ID, retry hints, maintenance code. | Probe before retry storms where possible; respect retry hints. | P1 | Surface provider-unavailable state and backoff. | Operational error and retry metadata only. | T-054, T-065 |
| Patient create/read/search | `/partner/patients` routes | MDI patient pointer, app linkage fields, workflow status, related case list. | Create before case/questionnaire submission; search/read for reconciliation. | P0 | Create or link MDI patient after account/consent gate. | `mdi_patient_id`, status, linkage timestamps only. | T-022, T-055 |
| Patient workflow | Patient workflow and notification opt-in/out events | Patient pointer, workflow name, operational status, timestamp. | May arrive before or after case events. | P1 | Update dashboard status and reconciliation hints. | Workflow status only. | T-079, T-058 |
| Case lifecycle | `/partner/cases` routes and status webhooks | MDI case pointer, status transition, provider timestamp, event ID. | Must be idempotent and tolerant of duplicate/out-of-order delivery. | P0 | Create case, store pointer, route status updates to dashboard/billing gates. | `mdi_case_id`, event envelope, status, timestamps. | T-022, T-057, T-058, T-079 |
| Questionnaire catalog | `/partner/questionnaires`, `/partner/questionnaires/:id`, `/partner/questionnaires/:id/questions` | Questionnaire ID/version, question metadata, controls, option metadata. | Fetch after offering/case context is known. | P0 | Render MDI-provided questions in Apoth intake UI. | Render from MDI; do not persist question text or responses. Store only approved non-clinical pointers/status. | T-022, T-056 |
| Questionnaire submission | Case/questionnaire submission route shape from MDI collection | Patient pointer, case pointer, question IDs, response values. | Submit after consent, residency, eligibility, and case setup gates. | P0 | Send responses to MDI and immediately discard local payload. | Submission pointer and completion status only. | T-022, T-056 |
| Voucher and offerings | `/partner/vouchers`, `/partner/offerings`, voucher events | Offering/voucher IDs, status, amount/reference fields. | Needed before final payment/fulfillment decisions if MDI owns offer/voucher state. | P1 | Reconcile plan/product eligibility and charge references. | Opaque voucher/offering pointers and status only. | T-078, T-080 |
| Partner charges | Partner additional charge and vouched amount charge events | Charge reference, amount, currency, patient/case pointers, timestamp. | May arrive after case approval or fulfillment milestone. | P0 | Decide payment unlock and Stripe orchestration trigger. | Charge reference, amount, currency, opaque pointers; no clinical labels. | T-078, T-081 |
| Files and orders | Case file events, order status/tracking events | File/order pointer, status, optional URL or tracking pointer. | Files may be clinical PHI; orders may lag case status. | P1 | Store pointer/status; fetch or embed through MDI only when required. | Opaque pointer/status only; no file bodies or clinical content. | T-079, T-083 |
| Messages and notifications | Message created, notification sent, text amount events | Message/notification pointer, channel/status, patient/case pointers. | Notification and message events may duplicate operational status. | P2 | Update dashboard badges without storing message body. | Event envelope and pointer only. | T-079, T-058 |
| Dashboard workflow | MDI patient/case/workflow reads or embedded workflow URL routes | Native status fields or embedded workflow URL. | Native dashboard should prefer MDI source of truth; embedded URL may be needed for care tasks. | P1 | Decide native-vs-embedded dashboard boundaries. | Pointers, URL expiry metadata if allowed, status only. | T-079 |

## Billing Unlock Contract

T-078 defines the launch billing unlock rule in
`docs/payments/mdi-billing-unlock-contract.md`. Stripe billing activation is
allowed only for the selected `case_clinically_approved` event when the event's
opaque `mdiCaseId` matches the local billing target and the local payment
method state is `payment_method_collected`.

All other MDI states fail closed for billing activation. `case_approved`,
`case_completed`, and later charge/order events may still inform dashboard or
reconciliation work, but they must not create Stripe charges or active
subscriptions unless T-078 is updated after live T-094 validation.

## Dashboard Surface Contract

T-079 defines the launch dashboard ownership matrix in
`docs/dashboard/launch-surface-matrix.md`. Apoth owns the native account/status
shell, generic action cues, Stripe billing mirror, and support entry points.
MDI remains the source of truth and interaction surface for clinical messages,
files/labs, clinician workflow, refills/follow-up care, and other care content
through short-lived embedded workflow links approved by the matrix.

## Must-Handle Webhook Groups

| Group | Events Observed In Collection | Apoth Action |
| --- | --- | --- |
| Case status | Created, support, waiting, approved, processing, completed, cancelled, assignment, tags | Idempotently update case status and audit envelope. |
| Clinical document or file | Case file, clinical note, file URL, lab/file-adjacent routes | Store pointer only; do not persist clinical bodies. |
| Patient lifecycle | Created, deleted, modified, workflow updates, tag changes, notification opt-in/out | Update linkage and dashboard state. |
| Billing/charge | Partner additional charge, vouched amount charge, text message amount charge | Evaluate payment unlock with opaque IDs only. |
| Voucher/offering/order | Voucher create/expire/delete, offering changes, order status/tracking | Reconcile launch fulfillment and dashboard state. |
| Message/notification | Message created, notification sent | Store event envelope and unread/status hints only. |

## Fixture Map

Sanitized fixtures live in `tests/fixtures/mdi/`:

| Fixture | Purpose |
| --- | --- |
| `token-success.json` | Token-provider success shape for T-053/T-054. |
| `token-error.json` | Token-provider failure shape. |
| `maintenance-error.json` | Maintenance/error handling shape. |
| `case-status-events.json` | Must-handle case status webhook shapes. |
| `case-charge-events.json` | Partner/voucher charge webhook shapes. |
| `patient-workflow-events.json` | Patient lifecycle/workflow shapes. |
| `message-notification-events.json` | Message and notification event pointer shapes. |
| `file-order-events.json` | File/order pointer and status shapes. |
| `questionnaire-flow.json` | Shape-only questionnaire render/submission contract with `QUESTION_TEXT_SENTINEL` and `ANSWER_VALUE_SENTINEL`. |

## Open Questions

| Question | Current Default | Owner |
| --- | --- | --- |
| Which exact MDI status or charge event unlocks payment capture? | T-078 selected `case_clinically_approved` plus matching case and collected payment method. Live ordering still needs T-094 validation before broadening the contract. | T-078, T-094 |
| Should dashboard care workflow be native Apoth UI, MDI embedded workflow URL, or mixed? | T-079 selected a native Apoth account/status shell with short-lived MDI embedded links for clinical/care workflows; see `docs/dashboard/launch-surface-matrix.md`. | T-079, T-060, T-061, T-062, T-063 |
| What are the exact webhook ordering guarantees and retry windows? | Assume at-least-once, duplicate, and out-of-order delivery. | T-057, T-058 |
| What exact questionnaire submission endpoint/shape is required in the live sandbox? | Use shape-only fixture until live T-094/T-056 validation confirms request body. | T-094, T-056, T-022 |
| How should maintenance status be detected across auth and partner routes? | Treat explicit maintenance responses and API status failures as retryable provider-unavailable states. | T-054, T-065 |

## Sandbox PoC Split

The live PoC remains required before production integration hardening:

1. Validate partner auth with approved sandbox credentials.
2. Create or link a sandbox test patient with non-real data approved for MDI.
3. Create a sandbox case and exercise the status lifecycle.
4. Capture webhook ordering, retry, and timing observations in sanitized form.
5. Confirm questionnaire fetch and submission shape without retaining responses.

That live work is tracked by T-094. This catalog must be updated after T-094
with sanitized observations and any contract changes.
