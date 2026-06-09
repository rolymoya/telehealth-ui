# Serverless IaC Runbook

This runbook covers the CDK package that defines Apoth's lean serverless launch
baseline. It is intentionally small: Cognito, DynamoDB, Lambda/API Gateway,
Secrets Manager, SQS/DLQ, EventBridge schedules, CloudWatch, and static
S3/CloudFront hosting in a later deploy ticket.

Production deploy is not ready while `ISS-002` remains open. The current
launch decision is a single AWS account, `329425487030`, with staging and
future production resources separated by explicit CDK stage names, secrets,
and deploy roles until a later architecture decision splits accounts.

## Commands

Run from the repo root:

```bash
npm --prefix infra install
npm --prefix infra test
npm --prefix infra run build
npm --prefix infra run synth -- --context stage=staging
npm --prefix infra run diff -- --context stage=staging
```

Use `stage=production` only after the AWS account baseline runbook is complete
and production deploy permissions are wired through protected workflows.
Production synth/diff also requires an explicit guard:

```bash
APOTH_ALLOW_PRODUCTION_SYNTH=true \
APOTH_PRODUCTION_ACCOUNT_ID=329425487030 \
npm --prefix infra run synth -- --context stage=production
```

## Stage Selection

The CDK app reads stage from CDK context first, then `APOTH_STAGE`, then falls
back to `staging`.

```bash
npm --prefix infra run synth -- --context stage=staging
APOTH_ALLOW_PRODUCTION_SYNTH=true \
APOTH_PRODUCTION_ACCOUNT_ID=329425487030 \
npm --prefix infra run synth -- --context stage=production
```

Staging uses destroy-friendly defaults for early iteration. Production uses
retain-oriented defaults and deletion protection for stateful resources.
Run stage synths one at a time because CDK writes to the shared `infra/cdk.out`
directory.

## Cost Posture

Launch-scale defaults are selected to stay low-cost:

- DynamoDB is on-demand, with one table for minimal app/linkage records.
- Lambda/API Gateway scale to zero between requests.
- SQS/DLQ exists only for webhook retry durability.
- EventBridge invokes bounded scheduled Lambda jobs only; there is no
  always-on worker process.
- Secrets Manager stores vendor credentials without duplicating them in CI.
- No VPC, NAT gateways, RDS/Postgres, Redis, ECS, App Runner, ECR app images,
  or VPC endpoints are part of launch infrastructure.

Before production deploy, run `cdk diff` and review for any resource outside
the allowed serverless boundary. Any exception needs a new architecture
decision.

## Outputs

The stack outputs identifiers needed by app configuration:

- Cognito user pool ID.
- Cognito app client ID.
- DynamoDB table name.
- API endpoint.
- Webhook queue and DLQ URLs/ARNs.
- Scheduled heartbeat Lambda name.
- MDI, Stripe, and app signing secret ARNs.
- CloudWatch launch observability dashboard name.

Do not paste secret values into docs, GitHub Actions variables, or logs. Store
real credentials in Secrets Manager only.

## Cognito Patient Auth Setup

The launch auth baseline uses a first-party Cognito flow. Cognito owns patient
email identity, password state, email verification, MFA enrollment/challenges,
refresh/session state, and the stable subject. Apoth product code must use
`src/lib/auth.ts`, `src/lib/auth/client.ts`, or a local wrapper built on them
for session lookup, current-user access, protected-route checks, and
sign-up/sign-in calls.

SRP remains the preferred browser auth mechanism once the SRP-capable Cognito
client package can be installed. During T-014, package installation for
`amazon-cognito-identity-js` was blocked by the environment approval policy, so
the launch UI uses Cognito's public JSON API with `USER_PASSWORD_AUTH` as an
explicit fallback. In this fallback, passwords are submitted directly from the
browser to Cognito over TLS. They must never traverse an Apoth server, route
handler, log, analytics event, ticket, screenshot, or persisted record. Revisit
this tradeoff and return to SRP/package auth when dependency policy permits.

Required public app configuration:

| Variable | Local | Staging | Production |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_COGNITO_REGION` | `us-east-1` unless running a local Cognito-compatible test harness | `us-east-1` | production stack region |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | staging test pool or deterministic test fixture | `us-east-1_urOM8PctH` | production stack output |
| `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID` | staging test client or deterministic test fixture | `2i8kvm8c840gfou4qvlm67u2be` | production stack output |

These values are public identifiers, not secrets. Keep them in stack outputs,
hosting environment variables, or client-safe config. Never store Cognito
passwords, refresh tokens, access tokens, ID tokens, MFA shared secrets, email
addresses, or verification codes in DynamoDB, Stripe metadata, logs, tickets,
or Secrets Manager.

Launch does not configure a Cognito hosted UI domain, OAuth flow, callback URL,
or logout URL. Any future hosted UI, social login, OAuth callback, or external
identity provider requires a new architecture/security decision and
stage-specific redirect tests before it can ship.

The current Cognito launch posture is:

- Self sign-up is enabled with email as the sign-in alias.
- Email is auto-verified by Cognito and account recovery is email-only.
- Passwords require at least 12 characters with uppercase, lowercase, and
  digits. Symbols are not required for launch.
- MFA is required with software-token TOTP only. SMS MFA is disabled.
- The app client enables SRP auth, the T-014 direct-to-Cognito
  `USER_PASSWORD_AUTH` fallback, refresh-token auth, and user-existence error
  prevention. Hosted UI/OAuth and client-secret generation are disabled.

### Staging Test User Smoke Path

Use a dedicated non-clinical test email and synthetic data only.

1. Confirm the stack outputs:

   ```bash
   aws cloudformation describe-stacks \
     --stack-name Apoth-staging-ServerlessPlatform \
     --query 'Stacks[0].Outputs[?starts_with(OutputKey, `PatientUserPool`)]'
   ```

2. Run sign-up through `/sign-up` against the app facade. Do not paste the
   password, verification code, MFA secret, token values, challenge/session
   identifiers, raw Cognito responses, or screenshots containing those values
   into logs, tickets, docs, review evidence, or screenshots.

3. If email delivery is not configured, an operator may confirm the synthetic
   staging user in Cognito for the smoke test:

   ```bash
   aws cognito-idp admin-confirm-sign-up \
     --user-pool-id us-east-1_urOM8PctH \
     --username patient-smoke@example.invalid
   ```

4. Complete first sign-in through `/sign-in`, enroll TOTP, and complete the MFA
   challenge. The facade evidence should show only pass/fail, route names,
   stage, and if needed the opaque Cognito subject. Session evidence should show
   only the Cognito subject, issuer, client ID, token use, and expiration.

5. Request and confirm password reset through `/reset-password`, then sign out
   through `/sign-out` and verify the facade no longer returns a session for the
   old browser state. If a smoke path emits evidence, store only opaque event
   IDs and `cognitoSub`; Cognito remains authoritative for auth details.

## Managed Encryption Baseline

Launch uses AWS-managed service encryption and minimized data storage rather
than application-level envelope encryption or encrypted column wrappers. The
cross-system data-classification map lives in
`docs/data/data-classification.md`; review it before intake, webhook, billing,
or dashboard work expands the data surface.

| Service | Launch encryption posture | Data class | Notes |
| --- | --- | --- | --- |
| Cognito user pool | AWS service-managed encryption | PHI-adjacent identity linkage | Stores identity/session/MFA state only; no clinical questionnaire content |
| API Gateway | AWS service-managed encryption for service data and CloudWatch access logs | PHI-adjacent transit | Security boundary for authenticated APIs and webhooks; keep patient data out of URLs and logs |
| Lambda | AWS service-managed encryption for runtime/service state and CloudWatch Logs | PHI-adjacent runtime | May transiently process intake or webhook payloads; persist only minimized records and never log bodies, headers, or raw provider payloads |
| DynamoDB app table | AWS-managed DynamoDB encryption (`TableEncryption.AWS_MANAGED`) | PHI-adjacent linkage/status/evidence | Stores opaque pointers, statuses, consent evidence, evidence events, and webhook idempotency records only |
| Secrets Manager | AWS-managed Secrets Manager encryption, no custom `KmsKeyId` by default | Restricted secret | CDK creates secret containers/metadata only; live values are populated in AWS |
| SQS webhook queue and DLQ | SQS-managed server-side encryption (`QueueEncryption.SQS_MANAGED`) | PHI-adjacent retry metadata | Payloads must be minimized; no raw questionnaire bodies or raw webhook archives |
| EventBridge schedules | AWS service-managed encryption for service state | Confidential operational | Invokes bounded Lambda jobs only; event payloads must stay operational and PHI-free |
| Lambda log groups and API access log group | CloudWatch Logs service-managed encryption | Confidential operational, possibly PHI-adjacent by correlation | Retention is stage-scoped and logs must use PHI-safe structured logging |
| CloudWatch metrics, alarms, dashboards | CloudWatch service-managed encryption | Confidential operational aggregates | Metric dimensions are bounded and must not include patient IDs, event IDs, routes, error text, or clinical terms |
| Future S3/CloudFront static hosting | S3-managed encryption for static public assets | Public by default | Do not store authenticated patient data, raw webhook archives, or PHI-bearing exports in the static hosting bucket |

AWS-managed keys are sufficient for launch while Apoth stores only the minimal
thin-PHI records named above. A customer-managed KMS key is required only after
a documented architecture/compliance decision, such as counsel or BAA evidence
requiring key separation, cross-account key grants, explicit key rotation/audit
evidence, PHI-bearing object storage, or any future local storage of clinical
content. Do not introduce custom KMS envelope encryption for launch records.

Any future customer-managed KMS decision must include an operational
failure-mode plan before production traffic: validate every runtime role can use
the key in the correct account/stage, define rollback or data migration steps,
monitor disabled keys and keys pending deletion, name the owner/escalation path,
and run service-specific smoke tests for DynamoDB, SQS, Secrets Manager, Lambda,
and any object storage that depends on the key.

## Observability And Launch Incidents

The launch baseline uses CloudWatch only: log groups, API access logs, metrics,
alarms, and the `apoth-{stage}-launch-observability` dashboard. Do not add
Datadog, Metabase, Sentry, external analytics, log shipping, or PHI-bearing
support tooling until the BAA register and compliance review explicitly approve
the vendor and data flow.

Production traffic remains blocked while AWS or MDI BAA/evidence status is not
active in `docs/compliance/baa-register.md`. CloudWatch, SQS, and DLQs may still
hold PHI-adjacent linkage identifiers even when application logging is
redacted.

### Webhook Lambda Contract

Future Stripe and MDI webhook routes must use the shared webhook helpers before
touching DynamoDB, SQS, logs, metrics, or evidence records. The raw request body
is passed only to signature verification and envelope parsing. After
verification, handlers operate on the minimized envelope: provider, opaque event
ID, canonical non-PHI event category, canonical route code, received timestamp,
and safe provider timestamp when available.

The route sequence is fixed: verify signature, validate freshness/replay window,
claim the DynamoDB idempotency record with a processing lease, run the handler
only for first-seen/retry-due/expired-lease events, enqueue any required durable
retry message, then return provider success only after required state and queue
writes succeed. Duplicate processed events return success without repeating side
effects. In-flight duplicates return retry while the processing lease is active
so provider redelivery continues until a terminal state is durably recorded.
Retryable failures that need durable queue ownership are
marked as `handoff` with a retry timestamp before enqueue; provider
redeliveries for handoff retries remain provider-reclaimable unless ownership is
successfully promoted. If queue send fails, ownership is returned to the provider
retry path. Durable retry messages move retry ownership to SQS/DLQ only after
enqueue succeeds and the idempotency record is promoted to queue-owned. Provider
redeliveries for queue-owned retries return success without processing. Queue deliveries
reclaim the event when SQS delivers the message; app-level retry timestamps are
advisory for provider redeliveries so SQS receive counts are not spent waiting
for a future `notBefore`. Queue-sourced retryable failures return a retry result
so SQS redrive/DLQ remains in charge. Terminal
records, including exhausted retries and non-retryable handler failures, return
provider success after the terminal state is recorded.

Stripe replay freshness is based on the signed Stripe timestamp tolerance. MDI
does not currently have an equivalent signed timestamp in the launch contract,
so MDI payloads must include a provider timestamp. Past timestamps are checked
against the documented provider retry window, currently 24 hours, while
future-dated payloads are limited to the short clock-skew tolerance.

Queue and DLQ bodies must contain only the minimized retry message: provider,
opaque event ID, canonical event category, canonical route code, received
timestamp, optional `notBefore` retry timestamp, attempt, and deterministic
correlation ID. Do not include raw provider event names, request bodies,
headers, emails, names, IP addresses, user-agents, clinical terms,
medication/condition descriptors, payment instrument details, or secret values.
Consumers must refetch provider state or use provider delivery logs for
debugging rather than relying on a local raw payload archive.

Webhook secrets are provider- and stage-scoped. Stripe webhook signing material
comes from the stage Stripe secret payload; future MDI webhook signing material
must come from an MDI-scoped Secrets Manager or SSM reference. Missing secrets
fail closed, and secret values must never appear in thrown errors, logs,
metrics, snapshots, tickets, or DLQ messages.

### Scheduled Job Contract

Scheduled launch work uses EventBridge rules that invoke bounded Lambda
handlers. The baseline creates `apoth-{stage}-scheduled-heartbeat`, which runs
every 15 minutes and updates one DynamoDB operational status item:
`STATUS#scheduled-heartbeat` / `CURRENT`.

The heartbeat Lambda stores only operational metadata: record type, schema
version, job name, stage, `ok` status, latest heartbeat timestamp, latest
scheduled timestamp, and the Lambda request ID. It must not write patient IDs,
vendor IDs, request/response bodies, clinical context, payment details, headers,
IP addresses, or user-agent values.

The EventBridge target has bounded retry behavior: at most one retry and a
maximum event age of one hour. Duplicate, delayed, or retried invocations are
safe because the handler overwrites the fixed status key with the latest
successful heartbeat instead of appending records. Future MDI reconciliation,
Stripe/MDI billing reconciliation, retention sweep, and health-check jobs
should follow the same pattern unless their ticket documents a stricter bound:
single-purpose Lambda handler, fixed or deterministic idempotency key, explicit
EventBridge retry policy, short timeout, PHI-safe logs, and no always-on worker
service.

Repeated heartbeat failures alarm on
`apoth-{stage}-scheduled-heartbeat-errors`. Check the Lambda log group and the
`Scheduled job failures` dashboard widget first. Do not add SNS/email/pager
actions until the launch ops contact path is approved.

### Support Evidence Triage

Use DynamoDB evidence events for patient/case timelines, CloudWatch for
operational diagnostics, and vendor systems for authoritative clinical,
billing, or auth detail. Do not copy questionnaire answers, clinician content,
raw webhook payloads, support free text, payment instruments, email/name
claims, IP addresses, or user-agent strings into DynamoDB, logs, tickets, or
incident summaries.

When support starts with a Cognito subject, read the patient-scoped evidence
timeline at `PATIENT#{cognitoSub}` / `EVIDENCE#{occurredAt}#{eventId}`. When
support starts with an MDI case ID, first resolve `MDI#CASE#{mdiCaseId}` /
`PATIENT` to the Cognito subject, then read the patient timeline. Stripe
customer/subscription lookups follow the same reverse-link pattern. Evidence
events should answer what code-level event happened, when it happened, who or
what actor class caused it, and which opaque vendor IDs were involved; they do
not replace MDI, Stripe, or Cognito records. Provider webhook side-effect
evidence uses deterministic event IDs plus a DynamoDB uniqueness guard, so
replays should not create duplicate logical evidence items.

### Dashboard

Open CloudWatch Dashboards and select:

- `apoth-staging-launch-observability`
- `apoth-production-launch-observability` after production is approved

The dashboard groups API errors, webhook queue health, scheduled job failures,
Stripe webhook failures/lag, MDI failures, onboarding failures, and webhook
processing failures. Custom application metrics are contract-only until the
owning route or job ticket emits them.

This baseline creates CloudWatch alarm state and dashboard widgets, but it does
not configure SNS, email, pager, or external notification actions. Launch
operators must watch CloudWatch during supervised testing, and any automated
alerting target must be added only after the ops contact path and compliance
review are approved.

### Alarm Map

| Alarm | Status | Symptom | Threshold | First check | Mitigation / escalation | Close criteria |
| --- | --- | --- | --- | --- | --- | --- |
| `apoth-{stage}-webhook-dlq-visible-messages` | Active | Webhook messages exhausted retries and reached the DLQ | `> 0` visible messages for 5 minutes | SQS DLQ depth and Lambda/webhook logs around the enqueue time | Pause replay until idempotency is verified; inspect sanitized event metadata only; escalate to Stripe or MDI if provider delivery changed | DLQ empty after safe replay or documented discard |
| `apoth-{stage}-webhook-oldest-message-age` | Active | Webhook processing is falling behind | Oldest message age `>= 15m` | SQS queue age, Lambda errors, API Gateway 5xx | Scale or fix consumer before replay; preserve idempotency records | Oldest age below threshold for two periods |
| `apoth-{stage}-api-5xx-errors` | Active | API is returning server errors | `>= 5` 5xx responses in 5 minutes | API errors widget, Lambda log groups, recent deploys | Roll back the route change if deploy-related; otherwise isolate failing integration | 5xx count below threshold for two periods |
| `apoth-{stage}-api-4xx-errors` | Active | API is receiving elevated rejected requests | `>= 50` 4xx responses in 5 minutes | API errors widget and route-level deployment notes | Check auth/CORS/config rollout; avoid logging request bodies while debugging | 4xx count returns to expected launch baseline |
| `apoth-{stage}-scheduled-heartbeat-errors` | Active | Scheduled heartbeat Lambda failed | `> 0` errors in 5 minutes | Scheduled job failures widget and Lambda log group | Fix configuration or DynamoDB write permission before treating scheduled jobs as healthy | Next scheduled invocation writes the heartbeat successfully and alarm clears |
| `apoth-{stage}-stripe-signature-failures` | Contract-only | Stripe webhook signature verification failed | `> 0` failures in 5 minutes once T-045 emits metrics | Stripe webhook endpoint config and sanitized webhook logs | Rotate/reconfigure webhook secret only through Secrets Manager; escalate in Stripe dashboard | No new failures after endpoint/secret fix |
| `apoth-{stage}-webhook-processing-failures` | Contract-only | Webhook handler rejected or failed after verification | `> 0` failures in 5 minutes once T-045 emits metrics | Webhook processing widget, idempotency records, DLQ | Fix handler before replay; replay only minimized payloads with idempotency in place | Failed events processed or safely terminal |
| `apoth-{stage}-mdi-outbound-failures` | Contract-only | MDI API outage, timeout, or integration failure | `>= 2` failures in 5 minutes once MDI clients emit metrics | MDI failures widget and MDI status/account contact | Degrade MDI-backed workflows; escalate through MDI support/account owner | MDI calls succeed for two periods |
| `apoth-{stage}-onboarding-failures` | Contract-only | Patients cannot complete onboarding/intake handoff | `>= 2` failures in 5 minutes once onboarding emits metrics | Onboarding widget, API 4xx/5xx, Cognito status | Pause paid acquisition if user-impacting; keep PHI out of support notes | Onboarding attempts succeed for two periods |
| `apoth-{stage}-stripe-webhook-lag-seconds` | Contract-only | Stripe webhook delivery or processing is delayed | Lag `>= 300s` once T-045 emits metrics | Stripe lag widget, SQS oldest age, Stripe dashboard | Check queue age and Stripe delivery retries; do not replay without idempotency | Lag below threshold for two periods |

`Contract-only` means the metric name, dimensions, dashboard widget, and alarm
exist before the route/job emitter is implemented. Missing data is expected and
is treated as not breaching. Do not use a contract-only green alarm as evidence
that the workflow is healthy.

### Metric And Log Safety

Custom metrics use the `Apoth/Application` namespace and only these bounded
dimensions: `Stage`, `Provider`, `Outcome`, `ReasonCode`, and `RouteGroup`.
Never use patient identifiers, Cognito subjects, MDI/Stripe IDs, webhook event
IDs, request IDs, condition/offering names, medication context, raw route
parameters, query strings, error messages, or free text as metric dimensions.

API Gateway access logs are allowlist-only and contain request ID, route key,
status, integration status, and response length. They must not include headers,
query strings, authorization values, request or response bodies, authorizer
claims, source IPs, email/name claims, or raw user-provided path values. Patient
data must never be placed in URLs.

Application logs must use the PHI-safe structured logging helper. Do not log raw
questionnaire bodies, provider payloads, headers, exception stacks, Stripe
metadata with health context, secret values, or free-text clinical/support
notes. DLQ payloads must be minimized and must never contain raw questionnaire
answers. Any retention extension, export, or log shipping requires legal and
compliance approval before use.

## Secrets Manager

Secrets are stage-scoped and must stay under `/apoth/{stage}/...`. Each payload
contains a non-secret `apothStage` sentinel, `secretKind`, and
`schemaVersion: 1`; app startup must reject secrets whose sentinel does not
match the active stage. CDK creates the secret containers and metadata only; it
must not manage live secret values because stack updates could overwrite
manually populated credentials. Populate values in AWS with the JSON shapes
below before enabling routes or jobs that depend on them.

| Secret | Kind | Required fields | Rotation |
| --- | --- | --- | --- |
| `/apoth/{stage}/mdi/api` | `mdiApi` | `clientId`, `clientSecret`, `apiBaseUrl` | Engineering plus MDI account owner; at least every 180 days or sooner if MDI requires it |
| `/apoth/{stage}/stripe/api` | `stripeApi` | `secretKey`, `webhookSigningSecret` | Engineering plus Stripe admin; API keys at least every 180 days, webhook secrets after endpoint changes or exposure |
| `/apoth/{stage}/app/signing` | `appSigning` | `signingSecret` | Engineering; at least annually and after suspected exposure |

Example payloads:

```json
{
  "apothStage": "staging",
  "secretKind": "mdiApi",
  "schemaVersion": 1,
  "clientId": "<mdi-client-id>",
  "clientSecret": "<mdi-client-secret>",
  "apiBaseUrl": "https://api.vendor.example"
}
```

```json
{
  "apothStage": "staging",
  "secretKind": "stripeApi",
  "schemaVersion": 1,
  "secretKey": "<stripe-secret-key>",
  "webhookSigningSecret": "<stripe-webhook-signing-secret>"
}
```

```json
{
  "apothStage": "staging",
  "secretKind": "appSigning",
  "schemaVersion": 1,
  "signingSecret": "<random-application-signing-secret>"
}
```

Server startup validates public environment variables on every render process.
Production runtime processes must set `APOTH_STAGE=production`. In production,
or when `APOTH_REQUIRE_SERVER_SECRETS=true`, startup also requires all three
secret payloads to be present and valid. Next production builds still require
the stage sentinel but do not require live secret payloads during prerendering.
Until a dedicated AWS Secrets Manager runtime client is added, hosting must
provide the secret payloads through the server-only environment bindings
`APOTH_SECRET_MDI_API_JSON`, `APOTH_SECRET_STRIPE_API_JSON`, and
`APOTH_SECRET_APP_SIGNING_JSON`. `APOTH_REQUIRED_SERVER_SECRETS` can narrow the
required comma-separated set for a specific server process, for example
`stripeApi,appSigning`. `APOTH_REQUIRE_SERVER_SECRETS` accepts only `true` or
`false` when set.

Public Cognito and client configuration, including user pool IDs, app client
IDs, hosted domains, and public app URLs, is not secret material and should stay
in stack outputs or client-safe config. Do not place those values in Secrets
Manager unless a future integration introduces actual confidential client
material.

### Rotation Steps

1. Create replacement credentials in the vendor console or trusted internal
   key-generation process.
2. Update only the affected stage secret in AWS Secrets Manager.
3. Deploy or restart the consumers that cache the secret.
4. Run a stage-appropriate smoke test against the new credential.
5. Revoke the old credential after the maximum overlap window has passed.

For Stripe webhook signing secrets and app signing material, prefer a
current/previous validation window when vendor or protocol behavior allows
in-flight callbacks or tokens. For MDI credentials, coordinate a maintenance
window if MDI cannot support parallel credentials.

If startup reports a wrong-stage sentinel, stop the deploy or rollback the
release. Do not edit logs to include secret values while diagnosing; inspect the
secret metadata, name, and `apothStage` sentinel in AWS instead.

Local tests may use `fake_` placeholders from the shared secret contract, but
runtime validation rejects those placeholder values.
