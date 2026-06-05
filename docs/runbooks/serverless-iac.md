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
- MDI and Stripe secret ARNs.

Do not paste secret values into docs, GitHub Actions variables, or logs. Store
real credentials in Secrets Manager only.
