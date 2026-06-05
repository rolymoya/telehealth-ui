# DynamoDB App Data Model

Apoth uses DynamoDB for minimal app linkage, status, consent evidence, and
webhook idempotency records. MDI remains the clinical system of record.
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
| Operational status | Apoth | `STATUS#{name}` / `CURRENT` | Keep while flag/status is relevant | No clinical content |

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
| `conflict` | Previous terminal failure or invalid state; do not process silently. |

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
