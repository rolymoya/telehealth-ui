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
| Patient profile | Apoth/Cognito | `PATIENT#{cognitoSub}` / `PROFILE` | Keep while account is active; delete or archive per retention policy | Minimal account status and routing state only |
| MDI linkage | MDI/Apoth | `PATIENT#{cognitoSub}` / `MDI#LINKAGE` | Keep while care workflow is active and per legal retention policy | MDI pointer IDs only |
| MDI reverse lookup | MDI/Apoth | `MDI#PATIENT#{mdiPatientId}` or `MDI#CASE#{mdiCaseId}` / `PATIENT` | Same as MDI linkage | Opaque reverse pointer only |
| Stripe linkage | Stripe/Apoth | `PATIENT#{cognitoSub}` / `STRIPE#LINKAGE` | Keep while billing relationship is active and per finance/legal retention | Opaque Stripe IDs and billing status only |
| Stripe reverse lookup | Stripe/Apoth | `STRIPE#CUSTOMER#{stripeCustomerId}` or `STRIPE#SUBSCRIPTION#{stripeSubscriptionId}` / `PATIENT` | Same as Stripe linkage | Opaque reverse pointer only |
| Consent evidence | Apoth | `PATIENT#{cognitoSub}` / `CONSENT#{consentKind}#{version}` | Keep per counsel-approved consent retention | Consent kind, version/timestamp, and minimized evidence |
| Webhook idempotency | Apoth | `WEBHOOK#{provider}#EVENT#{eventId}` / `CLAIM` | Keep long enough to cover vendor retry windows and audit needs | Event IDs/status only |
| Evidence event | Apoth | `PATIENT#{cognitoSub}` / `EVIDENCE#{occurredAt}#{eventId}` | Keep per counsel-approved evidence retention | Opaque timeline metadata only |
| Evidence event uniqueness | Apoth | `PATIENT#{cognitoSub}` / `EVIDENCE_UNIQUE#EVENT#{eventId}` for patient-scoped events; `EVIDENCE#EVENT#{eventId}` / `UNIQUE` for webhook side effects | Same as evidence event | Duplicate guard and timeline pointer only |
| Evidence case index | Apoth | `MDI#CASE#{mdiCaseId}` / `EVIDENCE#{occurredAt}#{eventId}` | Same as evidence event | Restricted case timeline pointer only |
| Operational status | Apoth | `STATUS#{name}` / `CURRENT` | Keep while flag/status is relevant | No clinical content; scheduled jobs may store bounded metadata such as stage, job name, latest heartbeat/scheduled timestamps, and request ID |

## Field Policy

These fields are allowed in the launch app-data table. Logs may include fields
marked "code/log-safe" only in structured, PHI-safe operational events. Fields
marked "restricted" should not be written to application logs except as counts,
record-type labels, or redacted presence booleans.

| Record | Field | Owner system | Retention expectation | Log posture |
| --- | --- | --- | --- | --- |
| All app-data records | `pk`, `sk`, `recordType`, `schemaVersion`, `createdAt`, `updatedAt` | Apoth | Same as containing record | `recordType` and schema/version are code/log-safe; keys and timestamps are restricted |
| Patient profile | `cognitoSub` | Cognito/Apoth | Keep while account is active; delete/archive per retention policy | Restricted; use stable request IDs or aggregate counts in logs |
| Patient profile | `onboardingStatus` | Apoth | Keep while account is active | Code/log-safe when not combined with patient identifiers |
| Patient profile | `residencyState` | Patient/Apoth | Keep while account is active; update when patient reconfirms residence | Restricted PHI-adjacent routing field; normalized two-letter U.S. state only, not an unsupported-state allowlist |
| Consent evidence | `cognitoSub` | Cognito/Apoth | Keep per counsel-approved consent retention | Restricted |
| Consent evidence | `consentKind`, `version`, `acceptedAt` | Apoth/legal content source | Keep per counsel-approved consent retention | Kind/version are code/log-safe when not combined with patient identifiers |
| Consent evidence | `ipHash`, `userAgentHash` | Apoth | Keep only if counsel approves minimized evidence retention | Restricted; never log raw IP or raw user-agent values |
| MDI linkage | `cognitoSub` | Cognito/Apoth | Keep while care workflow is active and per legal retention policy | Restricted |
| MDI linkage | `mdiPatientId`, `mdiCaseId` | MDI/Apoth | Keep while care workflow is active and per legal retention policy | Restricted; log only redacted/presence values |
| MDI reverse lookup | `cognitoSub`, `mdiPatientId`, `mdiCaseId`, `pointerType` | MDI/Apoth | Same as MDI linkage | `pointerType` is code/log-safe; identifiers are restricted |
| Stripe linkage | `cognitoSub` | Cognito/Apoth | Keep while billing relationship is active and per finance/legal retention | Restricted |
| Stripe linkage | `stripeCustomerId`, `stripeSubscriptionId` | Stripe/Apoth | Keep while billing relationship is active and per finance/legal retention | Restricted; do not place PHI or care context in Stripe metadata |
| Stripe linkage | `billingStatus` | Stripe/Apoth | Keep while billing relationship is active and per finance/legal retention | Code/log-safe when not combined with patient identifiers |
| Stripe reverse lookup | `cognitoSub`, `stripeCustomerId`, `stripeSubscriptionId`, `pointerType` | Stripe/Apoth | Same as Stripe linkage | `pointerType` is code/log-safe; identifiers are restricted |
| Webhook idempotency | `provider`, `eventId`, `status`, `retryable`, `attempts`, `retryOwner`, `processingExpiresAt`, `nextAttemptAfter`, `maxAttempts`, `retryExhaustedAt` | Vendor/Apoth | Keep long enough to cover vendor retry windows and audit needs | Provider/status/retry codes are code/log-safe; event IDs and timestamps are restricted |
| Evidence event | `eventId`, `eventType`, `eventCategory`, `occurredAt`, `recordedAt`, `actorType`, `status`, `summaryCode`, `requestId`, `source`, `metadata` | Apoth/vendor systems | Keep per counsel-approved evidence retention | Type/category/status/summary codes are code/log-safe; IDs, timestamps, source, and metadata values are restricted |
| Evidence event | `cognitoSub`, `mdiPatientId`, `mdiCaseId`, `stripeCustomerId`, `stripeSubscriptionId`, `webhookProvider`, `webhookEventId`, `adminActorId` | Cognito/MDI/Stripe/Apoth | Same as evidence event | Restricted; never log alongside clinical or payment-instrument context |
| Evidence event uniqueness | `cognitoSub`, `eventId`, `evidencePk`, `evidenceSk` | Apoth | Same as evidence event | Restricted |
| Evidence case index | `cognitoSub`, `mdiCaseId`, `eventId`, `evidencePk`, `evidenceSk` | Apoth/MDI | Same as evidence event | Restricted; event IDs may encode bounded workflow status, so do not log case-index keys or pointer fields |
| Operational status | `name`, `status`, `stage`, `jobName`, `lastHeartbeatAt`, `lastScheduledAt`, `lastRequestId` | Apoth/AWS | Keep while flag/status is relevant | Code/log-safe if values remain bounded operational codes and request IDs |

## Data Boundaries

- Cognito owns authentication identity, password/MFA state, and sessions.
- MDI owns clinical questionnaire answers, case details, clinician notes, and
  care workflow state that contains clinical content.
- Stripe owns payment instruments, charges, invoices, and subscriptions.
- DynamoDB stores only Apoth linkage/status records needed to connect those
  systems.
- `residencyState` is the only T-021 precheck value persisted locally. All 50
  U.S. state codes are valid after normalization. Missing or invalid state input
  is incomplete intake data, not an unsupported-state refusal.

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
Events with `mdiCaseId` also write a case-scoped pointer at
`MDI#CASE#{mdiCaseId}` / `EVIDENCE#{occurredAt}#{eventId}` in the same
transaction. Webhook evidence retries return the already-recorded evidence item
rather than creating a second timeline item, even when the uniqueness guard,
event row, or case pointer already exists.

Support reads do not scan the table. If support starts with a Cognito subject,
query that patient's `PATIENT#{cognitoSub}` partition with the `EVIDENCE#`
timeline prefix using bounded pagination. If support starts with an MDI case
ID, first resolve `MDI#CASE#{mdiCaseId}` / `PATIENT` through the existing reverse
lookup, then query the same case partition with the `EVIDENCE#` prefix and
dereference each pointer to its patient timeline event. Continue later case
pages with the returned `cognitoSub` and case-scoped `nextKey`; cursors from
another case partition or a non-`EVIDENCE#` sort key must fail validation.
Stripe customer or subscription IDs follow the reverse-lookup-to-patient pattern
and then use patient timeline pagination. Evidence timelines are ordered by
`occurredAt`, not by write/recording time. A paginated read is therefore a
moving operational view, not a snapshot isolation boundary: after a user has
advanced past page 1, a concurrently written event with an older `occurredAt`
can sort before the saved `nextKey` and will not appear by continuing from that
cursor. Support tooling must treat `nextKey` as a continuation token for one
live read, not as proof that earlier pages are complete forever. If support or
compliance needs a complete point-in-time view, wait for the relevant write
stream to settle and restart from the first page; refresh indicators should
tell users when new earlier evidence may exist.

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

- Consent kind: `platform_terms`, `privacy_notice`, `telehealth_consent`, or
  `compounded_medication_disclosure`.
- Consent version.
- Accepted timestamp.
- Optional hashed/salted IP evidence, stored with a `sha256:` prefix.
- Optional hashed/salted user-agent evidence, stored with a `sha256:` prefix.

Do not store raw IP address or raw user-agent values unless counsel approves
that retention in writing and this document is updated with the retention and
data classification decision.

Current required consent checks evaluate every required consent kind
independently. Bumping one document version re-prompts for that kind even if the
other required consent records are current. Pre-kind aggregate consent records
from local/test history are treated as stale for launch and do not satisfy
current onboarding gates.

Rendered legal document snapshots are not archived in S3 for launch. The source
legal pages and version constants are sufficient until counsel or LegitScript
requires durable byte-level evidence. If that requirement appears, add a new
architecture decision before storing document archives.

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
