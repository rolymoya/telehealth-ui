# Launch Dashboard Surface Matrix

## Decision

The Apoth launch dashboard is a native account/status shell around MDI and
Stripe source systems. Apoth owns navigation, generic status language, account
basics, billing mirrors, and safe action cues. MDI owns clinical content and
care workflow interactions. Stripe owns payment instruments, invoices, charges,
and subscriptions.

Embedded MDI workflows launch as short-lived user-scoped links opened from the
native dashboard. Iframes are deferred until T-062 proves URL lifetime,
embedding, logging, and browser isolation requirements are safe for the specific
MDI workflow. Full embedded URLs and tokens must never be persisted, logged, or
placed in support metadata.
For launch, iframe embedding remains deferred.

## Capability Matrix

| Capability | Launch ownership | Source event or endpoint family | Approved MDI route or decision | Native patient status/action code | Allowed local persistence | Forbidden local persistence | Embedded workflow mode | Fallback/deferred behavior | Downstream owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Case status | Native Apoth UI with MDI API-backed read/status mirror | MDI case lifecycle webhooks; partner case reads when available | Status reads only: `partner-get-partner-cases-case-id-get-case` and `partner-get-partner-cases-case-id-statuses-get-case-statuses`; no embedded route | `case_status_pending`, `case_status_clinical_review`, `case_status_billing_ready`, `case_status_cancelled`, `case_status_unavailable` | `mdi_case_id`, `mdi_patient_id`, bounded case status code, provider timestamp, webhook event ID, retry status | Raw case payloads, questionnaire answers, clinician notes, diagnoses, medications, prescription/order details | None | Show provider-unavailable state and retry later; do not infer clinical detail locally | T-058, T-063 |
| Action-needed prompts | Native Apoth cue plus MDI embedded workflow link | MDI waiting/support status; workflow request events for file upload, exam, driver license, intro video, preferred pharmacy | Approved link routes: `partner-get-partner-patients-patient-id-file-url-get-file-request-url` and `partner-get-partner-patients-patient-id-intro-video-get-intro-video-request-url`; exam, driver-license, and preferred-pharmacy routes deferred until route validated | `action_needed_open_mdi`, `action_needed_waiting`, `action_needed_unavailable` | Cue code, opaque patient/case pointer, optional request pointer, count, last event timestamp | Prompt body, requested file/lab content, clinical rationale, free-text instructions, raw workflow payload | Short-lived link for approved routes; iframe deferred | If URL creation fails or a cue has no approved route, show generic unavailable/support path without clinical specifics | T-060, T-062, T-063 |
| Messaging | MDI embedded workflow link with native unread/status cue only | `message_created`, notification/message endpoint family | Approved link route: `partner-get-partner-patients-patient-id-auth-get-messaging-app-url` | `open_mdi_messages`, `messages_unavailable` | Message cue code, unread count, opaque message pointer when needed for idempotency, timestamp | Message body, subject, attachments, clinician name/content, patient reply text | Short-lived link; iframe deferred | Show generic "messages unavailable" and support contact; no local composer at launch | T-060, T-062, T-063 |
| File and lab access | MDI embedded workflow link with native availability cue only | Case file, lab results, file upload request, case file added/deleted events | Approved upload/request link route: `partner-get-partner-patients-patient-id-file-url-get-file-request-url`; `partner-get-partner-cases-case-id-files-get-case-files` and `partner-get-partner-files-file-id-get-file` are pointer/status reads only, not native rendering | `open_mdi_files`, `file_action_needed`, `files_unavailable` | File/lab cue code, opaque file/request pointer, count, timestamp | File bodies, lab values, photos, file URLs, access tokens, clinical labels, OCR/extracted text | Short-lived link for approved upload/request flow; iframe deferred | Show generic unavailable/support path; no native file viewer at launch | T-060, T-062, T-063 |
| Clinician workflow | MDI embedded workflow link | MDI patient/case workflow URL family; case message/workflow events | Approved link route for care messaging: `partner-get-partner-patients-patient-id-auth-get-messaging-app-url`; any broader care workspace route deferred until route validated | `open_mdi_care`, `care_workflow_unavailable` | Opaque patient/case pointer, URL expiry timestamp, bounded workflow code | Clinician notes, treatment plan text, prescriptions, medical advice, visit transcript, full embedded URL | Short-lived link for approved messaging workflow; iframe deferred | Show care workflow unavailable and support contact; no native clinical workspace | T-062, T-063 |
| Refills and follow-up care | Deferred for native refills; MDI care messaging link for follow-up after T-061 validation | MDI care workflow URL helper; refill route remains internal/default-deny; partner order/voucher reads are PHI-heavy and not launch refill state | No embedded refill route approved for launch; follow-up care uses approved messaging route `partner-get-partner-patients-patient-id-auth-get-messaging-app-url`; internal refill route `internal-post-v1-patient-patients-patient-subscriptions-subscription-id-refill-refill-subscription` is default-deny | `open_mdi_care`, `care_workflow_unavailable`, `refills_deferred` | Opaque MDI patient/case pointer, bounded care/refill action code, workflow request ID/outcome/timestamp | Medication names, dose, directions, days supply, refills remaining, pharmacy notes, prescription details, order payloads, refill reason/free text, full workflow URLs/tokens | Short-lived link only for approved MDI care messaging; native refill and iframe embedding deferred | Show `refills_deferred` for native refills; route follow-up care to MDI messaging when linked, otherwise generic unavailable/support path | T-061, T-062, T-063 |
| Voucher, offering, and order cues | Native Apoth cue or ops signal from MDI status only | Voucher events, offering events, order status/tracking events, partner charge references | No embedded route approved; cue/status handling only until T-060/T-063 define dashboard rendering | `order_status_available`, `benefit_status_pending`, `cue_noop`, `ops_review_required` | Opaque voucher/offering/order/charge pointer, status code, amount/currency only when non-PHI and required for billing reconciliation, timestamp | Product/treatment names, prescription details, tracking URL, shipping address, fulfillment notes, raw charge payload | None | No-op safe-to-ignore events; ops review for ambiguous charge/order state | T-060, T-063 |
| Billing | Native Apoth UI with Stripe/DynamoDB billing mirror | T-078 billing unlock contract; Stripe checkout/setup/subscription webhook state | No MDI embedded route; follow T-078 billing unlock contract | `billing_payment_method_needed`, `billing_pending_approval`, `billing_active`, `billing_issue`, `billing_unavailable` | `stripe_customer_id`, `stripe_subscription_id`, billing status, current period timestamps, opaque MDI case/patient pointers | Payment instrument details, clinical event labels in Stripe metadata, condition/medication names, raw Stripe payloads | None | Billing unavailable/support path; never activate before T-078 permits it | T-024, T-025, T-063 |
| Account and profile basics | Native Apoth UI | Cognito session/profile; DynamoDB patient profile | No MDI embedded route | `manage_account`, `account_unavailable` | Cognito subject, account status, consent version/timestamps, residency state, non-clinical profile status | Clinical questionnaire answers, diagnosis, medication, clinician content, raw auth tokens | None | Show account unavailable without changing care or billing state | T-063 |
| Support | Native Apoth support pathway with MDI/Stripe pointers only | Apoth support contact; vendor pointer lookup by support staff where authorized | No MDI embedded route; medical support copy routes patients back to approved MDI workflow links only | `contact_support`, `support_unavailable` | Request ID, bounded support category code, opaque MDI/Stripe pointers if needed | Raw support free text in app-data, clinical messages, files/labs, payment instrument data, raw webhook payloads | None | Use generic support copy; route medical questions to MDI workflow, billing questions to Apoth support | T-063 |

## Embedded Workflow Rules

Approved launch embedded workflows are messaging, file/lab access, action-needed
clinical tasks, clinician/care workflow, and refills/follow-up care only where
T-061 confirms an MDI-owned flow. T-062 must implement one helper per approved
workflow purpose and approved route above. Rows marked deferred until route
validated are not approved embedded workflows for launch.

For every embedded workflow helper:

- generate or retrieve the URL server-side after authenticating the patient;
- scope the URL to the current Cognito subject and opaque MDI patient/case
  linkage;
- return only a short-lived URL to the browser response;
- store at most the workflow code, expiry timestamp, and opaque pointer needed
  for retry or support;
- redact full URLs, query strings, tokens, headers, and request/response bodies
  from logs, analytics, support metadata, and evidence events;
- prefer a link/button launch mode for launch; iframe embedding remains
  deferred until explicitly approved.

Dashboard implementation must not store or render clinical content locally:
message bodies, clinical notes, questionnaire answers, prescription details,
files, labs, photos, clinician guidance, and free-text clinical/support content
remain in MDI or another approved source system.

## Downstream Guidance

- T-060: implement cue handlers for messages, files/labs, exams, workflow
  requests, vouchers/offerings/orders, and safe terminal no-ops. Store only
  cue/status codes and opaque pointers.
- T-061: confirmed native refill processing is deferred for launch. The
  dashboard may show `refills_deferred` for native refills and may use the
  approved MDI messaging workflow for follow-up care when MDI patient/case
  linkage exists.
- T-062: build short-lived embedded link helpers only for the approved embedded
  rows and route slugs in this matrix. Do not add iframe support without a new
  review.
- T-063: build the native dashboard shell around the status/action codes in this
  matrix. Do not render clinical messages, files, labs, prescriptions, or
  questionnaire answers natively.

## Copy Boundary

Patient-facing dashboard copy should say "open your care workflow" or
"message your clinician in the care workflow" rather than promising native
Apoth messaging, native file/lab viewing, native prescription management, or
native refill processing. Deferred launch promises should be removed or routed
to generic support.
