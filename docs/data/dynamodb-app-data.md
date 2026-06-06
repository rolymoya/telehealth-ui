# DynamoDB App Data Model

Apoth uses DynamoDB for minimal app linkage, status, consent evidence, evidence
events, and webhook idempotency records. MDI remains the clinical system of record.
Questionnaire answers are submitted to MDI and must not be persisted in Apoth
DynamoDB after submission.

Use `docs/data/data-classification.md` as the cross-system classification map
for Cognito, DynamoDB, MDI, Stripe, logs, queues, secrets, and test fixtures.

## Table

T-039 defines one table per stage: `apoth-{stage}-app`.

| Attribute | Purpose |
| --- | --- |
| `pk` | Partition key |
| `sk` | Sort key |
| `recordType` | Strict record discriminator |
| `schemaVersion` | Record schema version |
| `createdAt` / `updatedAt` | ISO timestamps |

The launch model intentionally avoids GSIs. Direct user reads use Cognito
subject keys. Webhook routing uses opaque reverse-link records so handlers do
not scan the table or put PHI into third-party metadata.

## Records

| Record | Owner system | Key | Retention expectation | PHI posture |
| --- | --- | --- | --- | --- |
| Patient profile | Apoth/Cognito | `PATIENT#{cognitoSub}` / `PROFILE` | Keep while account is active; delete or archive per retention policy | Minimal account status only |
| MDI linkage | MDI/Apoth | `PATIENT#{cognitoSub}` / `MDI#LINKAGE` | Keep while care workflow is active and per legal retention policy | MDI pointer IDs only |
| MDI reverse lookup | MDI/Apoth | `MDI#PATIENT#{mdiPatientId}` or `MDI#CASE#{mdiCaseId}` / `PATIENT` | Same as MDI linkage | Opaque reverse pointer only |
| Stripe linkage | Stripe/Apoth | `PATIENT#{cognitoSub}` / `STRIPE#LINKAGE` | Keep while billing relationship is active and per finance/legal retention | Opaque Stripe IDs and billing status only |
| Stripe reverse lookup | Stripe/Apoth | `STRIPE#CUSTOMER#{stripeCustomerId}` or `STRIPE#SUBSCRIPTION#{stripeSubscriptionId}` / `PATIENT` | Same as Stripe linkage | Opaque reverse pointer only |
| Consent evidence | Apoth | `PATIENT#{cognitoSub}` / `CONSENT#{version}` | Keep per counsel-approved consent retention | Version/timestamp and minimized evidence |
| Webhook idempotency | Apoth | `WEBHOOK#{provider}#EVENT#{eventId}` / `CLAIM` | Keep long enough to cover vendor retry windows and audit needs | Event IDs/status only |
| Evidence event | Apoth | `PATIENT#{cognitoSub}` / `EVIDENCE#{occurredAt}#{eventId}` | Keep per counsel-approved evidence retention | Opaque timeline metadata only |
| Evidence event uniqueness | Apoth | `PATIENT#{cognitoSub}` / `EVIDENCE_UNIQUE#EVENT#{eventId}` for patient-scoped events; `EVIDENCE#EVENT#{eventId}` / `UNIQUE` for webhook side effects | Same as evidence event | Duplicate guard and timeline pointer only |
| Operational status | Apoth | `STATUS#{name}` / `CURRENT` | Keep while flag/status is relevant | No clinical content; scheduled jobs may store bounded metadata such as stage, job name, latest heartbeat/scheduled timestamps, and request ID |

## Data Boundaries

- Cognito owns authentication identity, password/MFA state, and sessions.
- MDI owns clinical questionnaire answers, case details, clinician notes, and
  care workflow state that contains clinical content.
- Stripe owns payment instruments, charges, invoices, and subscriptions.
- DynamoDB stores only Apoth linkage/status records needed to connect those
  systems.

Never store condition names, symptoms, diagnoses, medication names,
questionnaire answers, clinical notes, photos, labs, or clinician messages in
DynamoDB unless a future architecture decision and legal review explicitly
change the boundary.

## Strict Schemas

The TypeScript helpers in `src/lib/dynamodb/app-data.ts` use strict allowlisted
schemas. Constructors and repository writes reject unknown fields and known
clinical field names such as `answers`, `questionnaire`, `symptoms`,
`diagnosis`, `medications`, `clinicalNotes`, `photos`, and `labs`.

Read helpers also validate stored records before returning typed data. Unknown
record types, invalid enum values, missing key fields, and schema-version
mismatches fail closed.

## Evidence Events

Evidence events are patient-scoped timeline records for launch-critical facts
that support, compliance, and operators may need to reconstruct later:

- Consent grants and re-prompts.
- MDI handoff submission/failure and minimized MDI status updates.
- Stripe payment method collection, billing activation, and billing status
  transitions.
- Webhook claims, processing outcomes, and side effects.
- Support/admin actions, recorded as bounded action codes only.
- Notable auth events available from Cognito logs or app hooks.

Each event stores `eventId`, `eventType`, `eventCategory`, `occurredAt`,
`recordedAt`, `actorType`, `status`, and `summaryCode`. Optional linkage fields
are opaque IDs only: `mdiPatientId`, `mdiCaseId`, `stripeCustomerId`,
`stripeSubscriptionId`, `webhookProvider`, `webhookEventId`, `requestId`,
`adminActorId`, `source`, and a bounded primitive metadata map. Metadata string
keys are allowlisted per event type, and values must be code-shaped opaque
strings from per-event allowlists, not free text; numeric and boolean metadata
are not part of the launch schema. Each `eventType` has exactly one allowed
`summaryCode`, a bounded set of allowed statuses, and a positive ID shape for
its event ID and linkage fields. Event types that support case/vendor lookup
require the relevant opaque linkage fields, except failed handoffs may use a
request ID until the vendor IDs exist.

Provider side-effect events must use deterministic event IDs. The helper
`createWebhookEvidenceEventId(provider, webhookEventId, summaryCode, sideEffect?)`
derives stable IDs so webhook retries record the same logical evidence item
instead of creating a second timeline item with a later write timestamp. Side
effect evidence must include the side-effect code in the ID so one provider
webhook can safely record multiple distinct side effects. Billing side effects
must include Stripe customer and subscription IDs; MDI status side effects must
include MDI patient and case IDs. Evidence writes also create a uniqueness guard
in the same transaction so the logical event ID is unique even if a retry uses a
different `occurredAt`. Non-webhook evidence guards are scoped to the Cognito
subject; webhook side-effect guards use the deterministic provider event ID.
Webhook evidence retries return the already-recorded evidence item rather than
creating a second timeline item.

Support reads do not scan the table. If support starts with a Cognito subject,
query that patient's `PATIENT#{cognitoSub}` partition with the `EVIDENCE#`
timeline prefix using bounded pagination. If support starts with an MDI case
ID, first resolve `MDI#CASE#{mdiCaseId}` / `PATIENT` through the existing reverse
lookup, then read the resolved patient timeline and filter to events for that
`mdiCaseId`. Continue later case pages with the returned `cognitoSub` and
`nextKey` so pagination remains bound to the same patient partition. Stripe
customer or subscription IDs follow the same reverse-lookup pattern. Evidence
timelines are ordered by `occurredAt`; if support is paging during active writes
and needs a complete point-in-time view, refresh from the first page after the
write stream settles or use a future append-ordered/case-scoped access path.

Evidence events are not a clinical note system, raw audit payload archive, or
tamper-evident hash chain. Do not store raw support notes, message/file
contents, webhook payloads, request/response bodies, IP addresses, user agents,
email/name claims, payment instruments, questionnaire answers, diagnoses,
symptoms, medications, photos, labs, or clinician content.

### Evidence Boundaries

| Evidence source | Lives in DynamoDB | Lives in CloudWatch | Lives in vendor system |
| --- | --- | --- | --- |
| Consent | Version, timestamp, minimized evidence event/status | PHI-safe route/job outcome metrics and logs | Rendered legal copy source outside the app if counsel requires it |
| MDI handoff/status | Opaque MDI patient/case IDs, handoff/status event code, timestamps | MDI availability/failure metrics and sanitized request IDs | Questionnaire answers, case details, clinician review, clinical workflow |
| Stripe billing | Opaque customer/subscription IDs, billing transition code, timestamps | Stripe webhook lag/failure metrics and sanitized request IDs | Payment instruments, invoices, charges, subscription details |
| Webhooks | Idempotency claim plus minimized evidence side-effect event | Verification/processing metrics and PHI-safe logs | Original provider event and delivery logs |
| Support/admin/auth | Action/auth event code, actor type, opaque actor/request IDs | Sanitized operational diagnostics only | Cognito auth detail or external support system records, if approved |

## Consent Evidence

Consent evidence defaults to minimized values:

- Consent version.
- Accepted timestamp.
- Optional hashed/salted IP evidence, stored with a `sha256:` prefix.
- Optional hashed/salted user-agent evidence, stored with a `sha256:` prefix.

Do not store raw IP address or raw user-agent values unless counsel approves
that retention in writing and this document is updated with the retention and
data classification decision.

## Webhook Idempotency

Webhook idempotency records use a distributed provider/event partition key.
Claiming an event returns one typed outcome:

| Outcome | Meaning |
| --- | --- |
| `claimed` | First delivery; process side effects. |
| `alreadyProcessing` | Duplicate while work is in flight; do not double-process. |
| `alreadyProcessed` | Duplicate already completed; acknowledge safely. |
| `failedRetryable` | Previous attempt was atomically reclaimed for another processing try. |
| `retryNotDue` | Retryable failure is not claimable by this delivery yet; do not enqueue or process again. |
| `queueOwnedRetry` | Provider delivery hit a queue-owned retry; acknowledge without processing so SQS/DLQ remains the owner. |
| `staleQueueDelivery` | Queue delivery attempt does not match the current queue-owned retry generation; acknowledge without processing. |
| `processingLeaseExpired` | Prior processing lease timed out; reclaim atomically and retry with an incremented attempt count. |
| `retryExhausted` | Max attempts were reached; mark terminal/DLQ-bound rather than continuing inline retries. |
| `conflict` | Previous terminal failure or invalid state; do not process silently. |

Idempotency records store status, retryability, attempt count, optional
`retryOwner` (`provider`, `handoff`, or `queue`), optional
`processingExpiresAt`, optional `nextAttemptAfter`, optional `maxAttempts`, and
optional `retryExhaustedAt`.
These fields are control metadata only; they must
not contain raw provider payloads, raw event labels, clinical context, patient
contact data, request headers, IP addresses, user agents, or payment instrument
details. Durable retry queues carry only minimized provider/event pointers and
canonical non-PHI route codes.

Reverse-link records map inbound MDI or Stripe identifiers back to Cognito
subjects without table scans. They must be created with conditional uniqueness
so one vendor ID cannot point to more than one patient.

Local tests and pure-domain code should use
`createInMemoryAppDataRepository()` from `src/lib/dynamodb/app-data.ts`.
It validates writes, reads, conditional updates, transactions, reverse-link
uniqueness, and stale reverse-link deletes without requiring AWS credentials.

## Stripe Metadata

Stripe metadata must contain opaque non-PHI IDs only. Use Apoth internal
identifiers or vendor pointers that do not reveal condition, medication,
diagnosis, symptom, or care context. Do not send MDI questionnaire answers or
clinical workflow detail to Stripe metadata.
