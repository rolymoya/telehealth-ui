# Serverless IaC Runbook

This runbook covers the CDK package that defines Apoth's lean serverless launch
baseline. It is intentionally small: Cognito, DynamoDB, Lambda/API Gateway,
Secrets Manager, SQS/DLQ, EventBridge later, CloudWatch, and static
S3/CloudFront hosting in a later deploy ticket.

Production deploy is not ready while `ISS-002` remains open. Real AWS account
IDs, AWS BAA evidence, IAM Identity Center state, and GitHub OIDC role ARNs
must come from the actual AWS account.

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
APOTH_PRODUCTION_ACCOUNT_ID=<real-production-account-id> \
npm --prefix infra run synth -- --context stage=production
```

## Stage Selection

The CDK app reads stage from CDK context first, then `APOTH_STAGE`, then falls
back to `staging`.

```bash
npm --prefix infra run synth -- --context stage=staging
APOTH_ALLOW_PRODUCTION_SYNTH=true \
APOTH_PRODUCTION_ACCOUNT_ID=<real-production-account-id> \
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
- MDI, Stripe, and app signing secret ARNs.
- CloudWatch launch observability dashboard name.

Do not paste secret values into docs, GitHub Actions variables, or logs. Store
real credentials in Secrets Manager only.

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

### Dashboard

Open CloudWatch Dashboards and select:

- `apoth-staging-launch-observability`
- `apoth-production-launch-observability` after production is approved

The dashboard groups API errors, webhook queue health, Stripe webhook
failures/lag, MDI failures, onboarding failures, and webhook processing
failures. Custom application metrics are contract-only until the owning route or
job ticket emits them.

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
