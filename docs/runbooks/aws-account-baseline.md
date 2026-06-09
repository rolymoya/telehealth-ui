# AWS Account Baseline Runbook

This runbook defines the lean AWS account baseline for Apoth's launch
architecture. It is intentionally serverless and small-scale: static Next.js
export on S3/CloudFront, API Gateway/Lambda backend, Cognito, DynamoDB, Secrets
Manager, SQS/DLQ only where retry durability is needed, EventBridge, and
CloudWatch.

The baseline does not introduce VPC networking, NAT gateways, private RDS,
Redis, ECS, App Runner, or VPC endpoints for launch.

## Account Structure

Use dedicated AWS accounts for environments when practical:

| Environment | AWS account ID | Purpose | Notes |
| --- | --- | --- | --- |
| Staging | `329425487030` | Pre-production Cognito, DynamoDB, Lambda/API Gateway, S3/CloudFront, Secrets, and webhook testing. | CDK staging stack deployed with SSO profile `apoth-staging`. Should be safe for test patients and sandbox vendor credentials only. |
| Production | `329425487030` | Future production-stage resources in the same AWS account unless a later architecture decision splits accounts. | Single-account launch exception recorded. Production resources must still use explicit `production` stage naming, protected deploy permissions, and readiness gates before real patient traffic. |

If launch starts with a single AWS account, separate staging and production by
explicit CDK stages, resource naming, IAM roles, and secrets. Split accounts
before production scale or external audit scope makes shared accounts risky.

Current launch decision: Apoth will use account `329425487030` as the single
AWS account for staging now and future production-stage resources once the app
is ready. This avoids premature account sprawl while preserving stage-separated
resource names, deploy roles, secrets, and runbook evidence.

## Required Baseline

1. AWS BAA
   - Confirm AWS BAA in AWS Artifact.
   - Record the effective date and account IDs in
     `docs/compliance/baa-register.md`.
   - Store the evidence path, not the agreement contents, in the repo.

2. IAM Identity Center / SSO
   - Use IAM Identity Center or organization-managed SSO for human access.
   - Do not create long-lived IAM user access keys for developers.
   - Require MFA for console access.
   - Assign least-privilege permission sets for account administration,
     deployment, read-only support, and billing.

3. Deploy Role
   - Create a staging deploy role and production deploy role.
   - Trust GitHub Actions OIDC for the specific GitHub organization,
     repository, branch, and workflow patterns.
   - Use short-lived role assumptions only.
   - Record role ARNs here once real values exist:

| Role | ARN | Trust source | Notes |
| --- | --- | --- | --- |
| Staging deploy | TODO: GitHub OIDC staging deploy role ARN | TODO: GitHub org/repo/workflow subject | Not created yet. Initial staging bootstrap/deploy used SSO role `arn:aws:sts::329425487030:assumed-role/AWSReservedSSO_AdministratorAccess_57fb0260b21e4638/roly-dev-sso`. |
| Production deploy | TODO: protected same-account production deploy role ARN | TODO: GitHub org/repo/workflow subject | Same AWS account as staging for now. Production deploys should require protected branches/environments and review gates. |

4. CloudTrail
   - Enable CloudTrail for management events in every launch account.
   - Prefer organization trail if AWS Organizations is in use.
   - Keep log retention launch-appropriate and cost-aware.
   - Protect CloudTrail logs from ordinary deploy roles.

5. GuardDuty and Security Findings
   - Enable GuardDuty in staging and production.
   - Route high-severity findings to an owner-controlled alert path.
   - Security Hub can be enabled if the account owner wants consolidated
     findings, but it is not required for the first tiny launch unless the
     certification package needs it.

6. CloudWatch and Logging
   - Set explicit log retention on Lambda/API logs.
   - Logs must be PHI-safe by default. Do not log questionnaire answers, raw
     webhook payloads, medications, diagnoses, symptoms, clinician notes,
     patient messages, or secrets.
   - Prefer structured event IDs, provider IDs, request IDs, and opaque patient
     linkage IDs.

7. Managed Encryption
   - Use AWS-managed encryption for DynamoDB, S3, SQS, and CloudWatch unless a
     later architecture decision requires customer-managed keys.
   - Secrets Manager stores vendor credentials. Never store secrets in GitHub
     Actions variables, code, logs, or docs.

## Serverless Launch Boundary

Allowed launch primitives:

- Cognito user pools and app clients for patient identity.
- DynamoDB for minimal app profile, MDI pointers, Stripe pointers, consent
  evidence, billing state, and webhook idempotency records.
- Lambda/API Gateway for authenticated APIs and webhook ingestion.
- S3/CloudFront for static Next.js export hosting.
- Secrets Manager for MDI, Stripe, and other vendor credentials.
- SQS/DLQ where webhook or reconciler retry durability is needed.
- EventBridge for scheduled Lambda jobs.
- CloudWatch logs, metrics, and alarms.

Explicitly out of scope for launch unless a new architecture decision reopens
them:

- RDS or Postgres.
- Redis.
- ECS or always-on worker services.
- App Runner.
- NAT gateways.
- VPC endpoints.
- Custom VPC networking for app workloads.

## Implementation Checklist

Complete these before production launch. Use real AWS/account evidence only.

- [x] Confirm staging account ID: `329425487030`.
- [x] Document single-account launch exception: staging and future
      production-stage resources use account `329425487030` until a later
      architecture decision splits accounts.
- [x] Record AWS BAA effective date in `docs/compliance/baa-register.md`:
      `June 8, 2026`.
- [x] Record AWS BAA evidence path in `docs/compliance/baa-register.md`.
- [x] Enable IAM Identity Center/SSO for developer access. Verified instance:
      `arn:aws:sso:::instance/ssoins-7223bfcc3b158a96`.
- [ ] TODO: Confirm account-wide MFA enforcement for all developer/admin users.
- [ ] TODO: Remove or disable long-lived developer IAM user keys.
- [ ] TODO: Create staging deploy role with GitHub OIDC trust.
- [ ] TODO: Create protected production-stage deploy role with GitHub OIDC
      trust in the same AWS account.
- [ ] TODO: Enable CloudTrail management events. CLI check
      `aws cloudtrail describe-trails --include-shadow-trails` returned no
      trails in staging.
- [ ] TODO: Enable GuardDuty and route high-severity findings. CLI check
      `aws guardduty list-detectors` returned no detectors in staging.
- [x] Set CloudWatch log retention defaults for Lambda/API logs in the CDK
      staging stack.
- [ ] TODO: Confirm Secrets Manager is the only credential store for vendor
      API secrets.
- [x] Confirm no VPC, NAT, RDS, Redis, ECS, App Runner, or VPC endpoints
      are part of launch infrastructure.

## Staging Deployment Evidence

`Apoth-staging-ServerlessPlatform` was deployed to account `329425487030` in
`us-east-1` using SSO profile `apoth-staging`.

- CDK bootstrap stack: `CDKToolkit`, status `CREATE_COMPLETE`.
- Application stack ARN:
  `arn:aws:cloudformation:us-east-1:329425487030:stack/Apoth-staging-ServerlessPlatform/47e5c000-63ac-11f1-9dcb-0afff611d6bb`
- Public health endpoint:
  `https://un74umczu7.execute-api.us-east-1.amazonaws.com/health`, verified
  response `{"ok":true}`.
- Scheduled heartbeat rule target:
  `arn:aws:lambda:us-east-1:329425487030:function:apoth-staging-scheduled-heartbeat`.
- Observability dashboard: `apoth-staging-launch-observability`.

Stack outputs captured from CloudFormation:

| Output | Value |
| --- | --- |
| `ApiEndpoint` | `https://un74umczu7.execute-api.us-east-1.amazonaws.com` |
| `AppTableName` | `apoth-staging-app` |
| `PatientUserPoolId` | `us-east-1_urOM8PctH` |
| `PatientUserPoolClientId` | `2i8kvm8c840gfou4qvlm67u2be` |
| `ScheduledHeartbeatFunctionName` | `apoth-staging-scheduled-heartbeat` |
| `WebhookQueueArn` | `arn:aws:sqs:us-east-1:329425487030:apoth-staging-webhook-processing` |
| `WebhookDeadLetterQueueArn` | `arn:aws:sqs:us-east-1:329425487030:apoth-staging-webhook-dlq` |
| `MdiApiSecretArn` | `arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/mdi/api-NDEIUc` |
| `StripeSecretArn` | `arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/stripe/api-jGmsWe` |
| `AppSigningSecretArn` | `arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/app/signing-YtRbE6` |

## Developer Verification

A developer is ready to deploy once all of these are true:

1. The developer signs in with SSO and MFA.
2. The developer can assume the staging deploy role without long-lived IAM
   access keys.
3. GitHub Actions can assume the staging deploy role through OIDC.
4. Production role assumption is limited to protected branches or approved
   workflows.
5. CloudTrail and GuardDuty are active in the target account.
6. The BAA register contains the real AWS BAA effective date and account IDs.

If any item remains `TODO:`, do not treat the account baseline as production
ready.
