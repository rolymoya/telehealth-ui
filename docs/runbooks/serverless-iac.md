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

Do not paste secret values into docs, GitHub Actions variables, or logs. Store
real credentials in Secrets Manager only.

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
