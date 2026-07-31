# Stripe Data Policy

Stripe is not BAA-eligible for the Apoth launch posture. Treat every Stripe
field Apoth controls as non-PHI only. Stripe may receive payment data and opaque
linkage identifiers, but it must not receive health context.

## Allowed Metadata

Apoth-controlled Stripe metadata may contain only these keys:

| Key | Value shape | Purpose |
| --- | --- | --- |
| `app_patient_id` | Opaque Apoth patient/account alias | Connect Stripe records to Apoth app data without exposing clinical context |
| `cognito_sub` | Cognito subject or opaque subject alias | Resolve the authenticated account when needed |
| `mdi_patient_id` | Opaque MDI patient pointer | Link billing workflow to MDI without clinical details |
| `mdi_case_id` | Opaque MDI case pointer | Link billing workflow to MDI without case details |
| `apoth_order_id` | Opaque Apoth order/workflow alias | Idempotency and support lookup |
| `apoth_stage` | `staging` or `production` | Stage separation |

Do not add free-text metadata keys. New keys require a policy update and tests.

For anonymous checkout, `apoth_order_id` is derived from a browser-generated
initialization UUID with the server signing secret. It is not an email,
account ID, device fingerprint, clinical identifier, or reversible patient
identifier.

## Disallowed Data

Never send these to Stripe metadata, product names, price nicknames,
descriptions, Checkout labels, Customer descriptions, logs, or webhook-derived
side effects controlled by Apoth:

- Condition names, diagnoses, symptoms, or health goals.
- Medication names, dose names, prescription details, or compounded-drug context.
- Questionnaire questions, answers, eligibility outcomes, or clinician notes.
- MDI clinical workflow status beyond opaque patient/case pointers.
- Raw webhook payloads, request headers, IP addresses, user agents, or support
  free text.

The launch Checkout Session does not send product or treatment names, line
items, or clinical context to Stripe. The email a patient enters may be passed
to Stripe through Checkout's dedicated email field for payment setup and
receipt/account support, but it must never be copied into metadata,
descriptions, logs, or opaque-ID fields.

## Descriptor Rules

Descriptors controlled by Apoth must be generic and non-clinical, such as
`Apoth membership` or `Apoth account`. They must not name a treatment, condition,
medication, diagnosis, symptom, or clinician action.

## Secrets And Webhooks

- Store Stripe API keys and webhook signing secrets in the stage Stripe secret
  contract, never in client code.
- Prefer restricted API keys (`rk_`) with least privilege for deployed
  services. Test fake keys may use placeholder values in tests only.
- Server code must construct Stripe clients through the server-only helper.
- Webhook handlers must verify Stripe signatures with the configured endpoint
  signing secret before idempotency work or side effects.
- Do not log Stripe keys, webhook signing secrets, raw payloads, or full
  metadata maps. Logs may include bounded route/status codes and redacted
  presence booleans only.
- A custom Checkout Session `client_secret` is response-only. Never persist it
  in DynamoDB, cookies, local/session storage, URLs, analytics, or logs.
- Pending enrollment completion is accepted only from a signature-verified
  `checkout.session.completed` or `setup_intent.succeeded` webhook.

## Automated Checks

`src/lib/stripe-policy.ts` defines the metadata and descriptor validators.
Tests must reject representative PHI-shaped examples before Stripe helper
parameters can be returned.
