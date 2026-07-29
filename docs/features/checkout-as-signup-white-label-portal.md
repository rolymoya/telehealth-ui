# Checkout-as-Signup and White-Label Portal Migration

Status: active-goal architecture and migration contract.

## Outcome

Apoth will present a familiar ecommerce funnel while keeping clinical work in a
white-label patient portal:

1. A visitor chooses an offering on an Apoth marketing page.
2. Stripe-hosted Checkout collects the visitor's email and a reusable payment
   method. Checkout is account creation from the visitor's perspective.
3. A signed Stripe webhook records payment-method readiness without reading the
   Checkout email, provisioning identity, or establishing a browser session.
4. The Checkout completion page verifies control of the email with a Cognito
   email OTP and establishes the Apoth session.
5. Apoth binds the verified Cognito subject to the pending enrollment and
   creates a short-lived, patient-scoped launch into the selected white-label
   portal.
6. The portal owns intake, clinical content, and the ongoing care experience.
7. A verified, matching clinical-approval event unlocks Stripe billing. Merely
   saving a payment method never creates a charge or subscription.

The public marketing site, Apoth commerce/account shell, and vendor clinical
portal remain separate runtime and data boundaries even when their visual
branding is continuous.

## Decisions

### Route ownership

| Surface | Launch routes | Owner | Data boundary |
| --- | --- | --- | --- |
| Marketing | `/`, `/weight-loss`, `/about`, `/privacy`, `/terms` | Next static export | Public content only. No authenticated session or clinical data. |
| Commerce/account | `/checkout`, `/checkout/complete`, `/verify`, `/account`, `/billing`, `/portal/launch` | Vite patient app plus API Gateway/Lambda | Cognito identity, Stripe pointers, consent evidence, opaque enrollment and portal pointers. |
| Clinical portal | Custom vendor domain such as `care.apoth.example` | Selected white-label vendor | Intake answers, clinical messages, files, treatment decisions, and care workflow. |

The marketing CTA navigates to the commerce shell with a server-approved
catalog code. The catalog code can choose Apoth presentation and pricing, but
it must not be copied into Stripe metadata, descriptions, logs, analytics, or
support evidence. Stripe objects use generic Apoth account language only.

### Checkout surface

Launch uses Stripe-hosted Checkout rather than a custom card form. The Checkout
Session contract is:

- `mode: "setup"` so no PaymentIntent, invoice, charge, or subscription is
  created during signup;
- `currency: "usd"` because setup mode with dynamic payment methods requires a
  currency;
- `customer_creation: "always"` so the completed session has a Stripe Customer
  and the SetupIntent payment method is attached to it;
- `client_reference_id` set to an opaque Apoth enrollment ID;
- `consent_collection.terms_of_service: "required"` after the production
  Stripe Dashboard terms URL has been configured and counsel approves the
  checkout disclosure;
- `setup_intent_data.metadata` and Session metadata limited to
  `apoth_order_id` and `apoth_stage` before identity verification;
- an `integration_identifier` with the required random eight-letter suffix;
- no `payment_method_types` field, allowing Stripe dynamic payment methods to
  show Apple Pay, Link, cards, and other eligible methods;
- a 60-minute Checkout expiration and a generic cancel URL back to the Apoth
  product page;
- a success URL at the server callback
  `/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}`.

Stripe's success redirect is a usability signal, not proof of completion. The
signed webhook is authoritative. The callback validates the Session ID, the
Session's `client_reference_id`, the Stripe Customer, SetupIntent status, and
the signed anonymous enrollment cookie before advancing. It then responds with
a `303` to a clean `/checkout/complete` URL. The callback and completion page
are `no-store`, use `Referrer-Policy: no-referrer`, load no third-party
resources, and redact query strings so the Session ID cannot leak through
analytics, browser referrers, or routine access logs.

Stripe API clients will move from the repository's pinned
`2026-05-27.dahlia` version to the current supported API/SDK version in the
implementation ticket, with contract tests covering the parameter change.
Stripe credentials remain restricted keys in Secrets Manager with stage-specific
webhook secrets.

### Apple Pay

Apple Pay is a payment method, not an authentication factor and not Sign in
with Apple. It can satisfy payment-method setup, but the patient must still
verify control of the Checkout email before Apoth grants account or portal
access.

Stripe Checkout is responsible for Apple Pay merchant-token handling for later
recurring or deferred off-session charges. Apple Pay is shown only when the
device, browser, wallet, country, currency, and Stripe configuration are
eligible. Card and Link remain normal fallbacks. If Checkout is embedded later,
every top-level and iframe domain that displays Apple Pay must be registered;
hosted Checkout is the launch surface.

### Passwordless identity

Cognito remains the identity provider. The user pool and app client enable the
`USER_AUTH` choice flow with `EMAIL_OTP`. Checkout does not ask the visitor to
choose a password. Returning patients sign in with the same email OTP flow and
can add a passkey after a verified session in a later enhancement.

The OTP-start service can idempotently provision a passwordless Cognito user,
but the webhook cannot. Provisioning does not mark the email as verified and
cannot bind a new Stripe Customer to an existing account solely because the
strings match. A malicious visitor can enter another person's email at
Checkout. The binding transaction occurs only after a successful Cognito OTP
proves control of that email.

New identities use a deterministic opaque username derived from an HMAC of the
normalized email. Existing launch users are resolved through Cognito's email
attribute and migrated without changing their stable `sub`. The raw email lives
only in Stripe and Cognito. DynamoDB may store an HMAC email fingerprint for a
bounded uniqueness/recovery index; the fingerprint is treated as sensitive,
never logged, and is not sent to Stripe metadata or the portal.

Cognito responses stay generic enough to prevent a checkout or sign-in endpoint
from becoming a reliable account-enumeration oracle. A checkout for an existing
email creates a pending enrollment, then the verified owner decides whether to
attach that enrollment to the existing account.

Every OTP attempt has a short-lived, server-side, single-use verification
transaction. It binds one mode (`enrollment_verification` or
`returning_sign_in`) to the enrollment, normalized-email fingerprint, Cognito
challenge correlation, and, for enrollment verification, the Stripe
Customer/Session pair. A successful ordinary sign-in can never bind an
enrollment, and challenges from separate browser attempts cannot be mixed.

Email normalization is deliberately conservative: trim surrounding whitespace
and lowercase using a documented canonical form. Apoth does not fold dots or
strip plus-address suffixes. Fingerprints use a dedicated, stage-specific,
versioned HMAC secret with dual-read/single-write key rotation.

## State model

Enrollment state is orthogonal rather than one large linear enum. Each dimension
is monotonic and updated conditionally:

| Dimension | States |
| --- | --- |
| Checkout | `created`, `open`, `completed`, `expired`, `abandoned` |
| Enrollment payment setup | `pending`, `setup_succeeded`, `failed`, `detached` |
| Identity | `unprovisioned`, `verification_pending`, `verified` |
| Portal handoff | `unavailable`, `ready`, `issued`, `launched`, `expired` |
| Care | `not_started`, `intake_in_progress`, `clinical_review`, `billing_ready`, `declined`, `closed` |
| Billing | Existing `not_started`, `payment_method_pending`, `payment_method_collected`, `active`, `past_due`, `cancel_pending`, `canceled` |

Required invariants:

- `identity = verified` requires a Cognito `sub` produced by a completed email
  OTP or another explicitly approved authentication factor.
- `portal handoff = ready|issued|launched` requires verified identity and
  enrollment payment setup recorded as `setup_succeeded` by a signed Stripe
  event.
- `billing = payment_method_collected` requires the verified account binding;
  an anonymous completed SetupIntent alone remains enrollment-scoped.
- `billing = active` requires `care = billing_ready`, a matching opaque case
  pointer, `billing = payment_method_collected`, and an idempotent activation
  decision.
- `care = declined|closed` can never activate billing. Late Stripe events must
  not reopen canceled billing.
- No browser redirect, client state, email string, or portal query parameter can
  satisfy an invariant by itself.

## Minimal records and module boundaries

The implementation must support these records without scans; each query and
conditional mutation has a documented direct-key or GSI access path:

| Record | Permitted values | Retention |
| --- | --- | --- |
| Enrollment | Opaque enrollment ID, catalog pointer, checkout/payment/identity/handoff states, Stripe Customer/Session/SetupIntent IDs, HMAC email fingerprint, consent version/timestamp, created/updated/expiry timestamps | Pending and unclaimed records expire. A verified enrollment is reduced to permanent linkage/status fields. |
| Email claim | HMAC email fingerprint, opaque Cognito subject, claim timestamp/version | Retained only while needed for account uniqueness and recovery; treated as sensitive. |
| OTP transaction | Random transaction digest, verification mode, enrollment pointer if applicable, HMAC email fingerprint/key version, Cognito challenge correlation, Stripe Customer/Session pointers, attempt/cooldown/expiry/consumed state | Minutes; consumed conditionally and removed by TTL. |
| Account linkage | Cognito subject, Stripe customer/subscription IDs, portal provider/patient/case pointers, billing/onboarding status | Account lifetime under the approved retention policy. |
| Provider event evidence | Provider, opaque event/case pointers, bounded internal status code, provider timestamp, processing/idempotency state | Bounded audit window. No raw payload or clinical text. |
| External operation | Opaque operation ID/type, aggregate pointer, deterministic idempotency key digest, `intent|leased|succeeded|retryable|terminal_review` state, lease owner/expiry, attempt count, next-attempt time, bounded result pointer/error code | Bounded reconciliation window; no payload, secret, URL, token, or clinical text. |
| Launch nonce | Random one-time nonce digest, Cognito subject, provider purpose, `ready|exchanging|consumed` state, exchange attempt/lease, expiry and consumed timestamp | Minutes; TTL cleanup. No full vendor URL or access token. |

Email, payment instrument data, Checkout URLs, portal URLs/tokens, questionnaire
answers, clinician content, diagnoses, treatments, medication names, and raw
webhook bodies are forbidden in DynamoDB evidence, logs, analytics, or support
metadata.

New persistence is split into focused modules for enrollment, identity claims
and OTP transactions, account-binding transactions, external-operation sagas,
and launch nonces. Provider ports separate patient/case provisioning, launch
minting, and inbound event verification. The existing large app-data modules
remain legacy adapters during migration; new business rules are not added to
those monoliths. `PatientApp` remains route composition only, with checkout,
verification, account, and portal-launch behavior in feature modules.

## API boundary

| Method and route | Authentication | Responsibility |
| --- | --- | --- |
| `POST /api/enrollment/checkout` | Anonymous origin/CSRF and rate-limit controls | Validate catalog code, create enrollment and hosted Checkout Session, set a signed HttpOnly enrollment cookie, return only an allowlisted Stripe Checkout URL. |
| `GET /api/enrollment/checkout-return` | Signed enrollment cookie plus Stripe Session ID | Validate the enrollment/session relationship, set only bounded recovery state, then redirect with `303` to clean `/checkout/complete`. |
| `GET /api/enrollment/status` | Signed enrollment cookie | Return a bounded state code for completion/recovery; never return email or Stripe/portal details. |
| `POST /api/auth/email-otp/start` | Enrollment cookie or normal sign-in initiation | Resolve the email server-side from the completed Stripe Customer or Cognito, provision/find the user, create a mode-bound OTP transaction, begin Cognito email OTP, and return a generic result plus opaque transaction handle. |
| `POST /api/auth/email-otp/confirm` | OTP transaction, Cognito challenge session, and CSRF | Verify and conditionally consume the mode-bound transaction, establish the secure Apoth session cookie, and, only in enrollment mode, atomically bind the enrollment and Stripe Customer to the Cognito subject. |
| `POST /api/portal/launch` | Verified Cognito session and bound enrollment | Authorize the patient/provider linkage, request or mint a single-use short-lived vendor launch, and redirect to an allowlisted HTTPS host. |
| `POST /api/webhooks/stripe` | Stripe signature | Record Checkout/SetupIntent evidence and payment-method readiness idempotently. Never establish a browser session. |
| `POST /api/webhooks/care/{provider}` | Provider signature or approved equivalent | Map provider events to bounded internal care states and evaluate the billing unlock. |

Anonymous mutation endpoints require exact production Origin/Referer checks,
signed SameSite cookies, WAF/rate limiting, bounded request sizes, no-store
responses, and generic errors. Authenticated mutation endpoints require the
existing secure session and CSRF contract. Completion and launch endpoints
redact query strings and provider URLs from logs. Completion-page security
headers include a restrictive CSP, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, and an explicit framing policy. Session and
enrollment-cookie TTLs, rotation, and revocation behavior are part of the API
contract rather than deployment defaults.

## Provider adapter contract

The selected portal must provide, or contractually support:

- a healthcare-appropriate BAA/compliance path before real patient data enters
  the service;
- custom-domain branding that does not imply Apoth practices medicine;
- patient provisioning with stable opaque patient and case identifiers;
- external identity federation or a server-created, single-use, short-lived SSO
  launch;
- patient-scoped return/deep-link behavior;
- signed and replay-resistant events for intake completion, clinical approval,
  decline, and closure;
- sandbox/test accounts that contain synthetic data only;
- documented URL/token lifetime, revocation, audit, export, and incident paths;
- no mandatory tracking pixels or subprocessors that lack the approved privacy
  posture.

Until a vendor satisfies those gates, Apoth implements only a provider-neutral
interface and a synthetic adapter. No production URL, credential, or patient
payload is guessed. The existing MDI billing event remains active during the
migration and is removed only after the replacement provider event contract is
validated in staging.

## Failure and concurrency behavior

- Before calling Stripe, anonymous checkout establishes a stable signed attempt
  cookie and persists an external-operation intent. Checkout creation uses a
  deterministic idempotency key scoped to stage and enrollment attempt. An
  ambiguous timeout adopts the existing Stripe result before retrying. A fresh
  retry after confirmed expiration creates a new Session rather than reusing an
  expired URL.
- Stripe event IDs are claimed with a processing lease before side effects.
  Checkout and SetupIntent events may arrive in either order and converge on
  the same monotonic state. The signed webhook performs bounded writes and
  enqueues only opaque work; it does not synchronously provision Cognito users.
- Webhook work records include owner/lease expiry, attempt count,
  `nextAttemptAfter`, maximum attempts, and a terminal/DLQ state. Responses use
  explicit retry semantics: invalid signatures and unsupported events are
  terminal, accepted duplicates are successful, and transient storage/queue
  failures return a retryable response.
- Cognito user provisioning is idempotent. A timeout is retried by deterministic
  opaque username/email claim rather than creating a second identity.
- OTP verification first conditionally consumes its mode-bound transaction,
  then wins the account-binding race through a DynamoDB transaction that claims
  both enrollment and Stripe Customer. Conflicts fail closed and route to
  account support without exposing the other account.
- Portal launch nonces are single use, patient scoped, expire within minutes,
  and transition `ready -> exchanging -> consumed`. Exchange uses a lease and
  provider idempotency key so an ambiguous provider timeout can reconcile and
  adopt a previously minted launch rather than issuing parallel launches.
- Clinical events are ordered by provider timestamp/rank. Duplicate, stale,
  mismatched-case, unverified, and unsupported events never activate billing.
- Every external mutation (Stripe Customer/Checkout, Cognito provisioning,
  provider patient/case provisioning, portal launch, and subscription
  activation) uses the durable operation lifecycle
  `intent -> leased -> succeeded|retryable|terminal_review`, deterministic
  idempotency, bounded retries/backoff, timeout result-adoption, alerts, and an
  opaque manual-repair path. Reconciliation reads authoritative state from
  Stripe, Cognito, and the portal provider. SQS/DLQ carries pointers only and is
  never a raw PHI archive.

Patient-facing failure states are explicit per route: Checkout can resume,
restart after expiry, or return to the product; completion polls with bounded
exponential backoff and jitter before offering recovery; OTP has attempt and
resend limits plus cooldown messaging; binding conflicts route to support with
an opaque code; portal launch distinguishes retryable provider unavailability
from a terminal authorization failure. No failure screen reveals whether an
email or enrollment belongs to another account.

## Migration and rollback

1. Land the new records, APIs, passwordless auth, and synthetic provider behind
   disabled stage flags. Existing intake remains authoritative.
2. Enable passwordless returning sign-in while retaining existing accounts and
   stable Cognito subjects.
3. Enable checkout-as-signup for internal/staging catalog codes. Verify Apple
   Pay on eligible real devices with Stripe test keys and synthetic patient
   data.
4. Enable the selected portal adapter in staging. Validate provisioning, SSO,
   return flow, event signatures, ordering, expiration, and clinical billing
   unlock.
5. Route a bounded production cohort to the new flow. Keep the old MDI route
   readable for in-flight cases; do not create new native questionnaires.
6. After reconciliation proves all active cases have an owner, remove marketing
   links and route ownership for `/sign-up`, `/intake`, and `/onboarding/mdi`.
7. Quarantine then delete superseded UI/API code in a later cleanup commit so
   rollback remains possible during the cohort period.

Rollback has independent kill switches for new Checkout creation, OTP
enrollment binding, provider provisioning, portal launch, and billing
activation. Each switch documents in-flight behavior, queue drain or
quarantine rules, and how operations already leased are reconciled. Rollback
leaves verified accounts, saved payment methods, and provider cases intact. It
never deletes Cognito users, Stripe Customers, or clinical cases. Patients
already in the portal continue there; support receives bounded opaque
references for manual reconciliation.

## Verification gates

TDD and integration coverage must prove:

- hosted Checkout uses setup mode, USD currency, customer creation, terms
  consent, dynamic methods, generic descriptors, current API version, safe URLs,
  and only allowed metadata;
- Apple Pay eligibility gracefully falls back without changing account or
  billing semantics;
- Checkout email alone cannot authenticate, verify, or bind an existing
  account;
- new and existing emails converge through OTP without duplicate Cognito users
  or Stripe/account injection;
- webhook signatures, replay, reordering, duplicate events, timeouts, expired
  sessions, lease expiry, poison events, retry exhaustion, and
  conditional-write conflicts fail safely;
- payment setup never creates a subscription, invoice, PaymentIntent, charge,
  or active billing state;
- only a verified matching provider approval plus collected payment method can
  create exactly one subscription;
- portal launches are authenticated, patient scoped, single use, short lived,
  HTTPS allowlisted, and absent from persistence and logs;
- no clinical answers or identifying checkout/portal tokens enter local
  storage, browser storage, logs, analytics, Stripe metadata, or test artifacts;
- keyboard, screen-reader, mobile, loading, error, cancel, expired, retry, and
  wallet/card fallback states work;
- marketing static build, patient Vite build, Lambda/CDK tests, unit/integration
  tests, Playwright journeys, security scans, staging smoke tests, and rollback
  checks pass.

Staging evidence also captures Checkout/OTP/portal-launch latency, bounded
completion-poll duration, queue age, retry and DLQ rates, and reconciliation
lag. Secrets Manager values and Stripe/Cognito/provider clients may be cached
per warm Lambda execution environment. Provider provisioning uses a durable,
idempotent lease on the first authenticated launch; the interactive launch
path performs at most one bounded provisioning request and one bounded
SSO-mint request.

Because the migration touches auth, payments, webhooks, DynamoDB concurrency,
PHI/privacy, infrastructure, and patient UI, the implementation receives
explicit security, data-boundary, reliability, accessibility, and operational
review. Production rollout additionally requires the
vendor contract/BAA evidence, counsel-approved checkout/terms language, Stripe
live payment-domain configuration, and designated synthetic staging evidence.

## Explicit non-goals

- Apoth does not render or persist the white-label clinical questionnaire.
- Apoth does not treat Apple Pay as identity verification.
- Apoth does not charge, create a subscription, or authorize a clinical purchase
  during checkout.
- Apoth does not put offering, condition, medication, diagnosis, symptom, or
  clinical status labels into Stripe.
- Apoth does not create a second password database or a second patient password
  in the portal.
- Apoth does not delete existing MDI linkage or billing evidence until migrated
  cases are reconciled.
- Apoth does not enable automatic tax without an approved tax-registration
  decision and implementation ticket.
