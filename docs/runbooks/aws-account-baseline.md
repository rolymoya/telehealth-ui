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
| Staging deploy | `arn:aws:iam::329425487030:role/apoth-staging-github-oidc-cdk-deploy` | `repo:rolymoya/telehealth-ui:ref:refs/heads/main` | AWS-side OIDC provider and role are active. Role supports CDK bootstrap role assumption plus narrow static UI publish permissions for the staging S3/CloudFront target. Owner-selected environment/workflow-specific trust tightening remains in `T-084`; first GitHub Actions smoke run is still pending. |
| Production deploy | TODO: protected same-account production deploy role ARN | TODO: GitHub org/repo/workflow subject | Same AWS account as staging for now. Production deploys should require protected branches/environments and review gates. |

4. CloudTrail
   - Enable CloudTrail for management events in every launch account.
   - Prefer organization trail if AWS Organizations is in use.
   - Keep log retention launch-appropriate and cost-aware.
   - Protect CloudTrail logs from ordinary deploy roles.
   - Current staging evidence: stack `Apoth-staging-AccountBaseline` creates
     trail `apoth-staging-management-events` with multi-region management
     events, global service events, log file validation, and retained S3 logs.

5. GuardDuty and Security Findings
   - Enable GuardDuty in staging and production.
   - Route high-severity findings to an owner-controlled alert path.
   - Security Hub can be enabled if the account owner wants consolidated
     findings, but it is not required for the first tiny launch unless the
     certification package needs it.
   - Current staging evidence: GuardDuty detector
     `a834cce0182642a2884136f8c0f152c0` is enabled in `us-east-1`.
   - Security findings contact path remains owner-provided and is tracked in
     `T-084`; do not treat production alert routing as complete until that path
     is recorded.

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
- [x] Create staging deploy role with GitHub OIDC trust. Verified role
      `arn:aws:iam::329425487030:role/apoth-staging-github-oidc-cdk-deploy`
      trusts `repo:rolymoya/telehealth-ui:ref:refs/heads/main`.
- [x] Define launch-scoped CDK CloudFormation execution policy
      `arn:aws:iam::329425487030:policy/apoth-staging-cdk-cloudformation-execution-launch`
      in the account-baseline stack.
- [ ] TODO: Re-bootstrap CDK with the launch-scoped execution policy and verify
      `AdministratorAccess` is no longer attached to
      `cdk-hnb659fds-cfn-exec-role-329425487030-us-east-1`.
- [ ] TODO: Create protected production-stage deploy role with GitHub OIDC
      trust in the same AWS account.
- [ ] TODO: Run the first GitHub Actions OIDC smoke check from `main` and
      decide any owner-selected environment/workflow trust restrictions in
      `T-084`.
- [x] Enable CloudTrail management events. Verified trail
      `apoth-staging-management-events` in `us-east-1`.
- [x] Enable GuardDuty. Verified detector
      `a834cce0182642a2884136f8c0f152c0` in `us-east-1`.
- [ ] TODO: Record and route the high-severity security findings contact path
      once the owner provides it in `T-084`.
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

`Apoth-staging-AccountBaseline` was deployed to account `329425487030` in
`us-east-1` using SSO profile `apoth-staging`.

- Stack ARN:
  `arn:aws:cloudformation:us-east-1:329425487030:stack/Apoth-staging-AccountBaseline/7ec00270-63b1-11f1-8e5c-12bdeb8afd65`
- CloudTrail trail:
  `arn:aws:cloudtrail:us-east-1:329425487030:trail/apoth-staging-management-events`
- CloudTrail log bucket:
  `apoth-staging-cloudtrail-logs-329425487030-us-east-1-an`
- CDK CloudFormation execution policy:
  `arn:aws:iam::329425487030:policy/apoth-staging-cdk-cloudformation-execution-launch`
- GuardDuty detector:
  `a834cce0182642a2884136f8c0f152c0`
- GitHub Actions OIDC provider:
  `arn:aws:iam::329425487030:oidc-provider/token.actions.githubusercontent.com`
- GitHub Actions deploy role:
  `arn:aws:iam::329425487030:role/apoth-staging-github-oidc-cdk-deploy`
- GitHub Actions deploy trust subject:
  `repo:rolymoya/telehealth-ui:ref:refs/heads/main`

Account-baseline verification captured on June 8, 2026:

```bash
AWS_PROFILE=apoth-staging aws sts get-caller-identity
```

Result: account `329425487030`, assumed role
`arn:aws:sts::329425487030:assumed-role/AWSReservedSSO_AdministratorAccess_57fb0260b21e4638/roly-dev-sso`.

```bash
AWS_PROFILE=apoth-staging aws cloudtrail describe-trails \
  --include-shadow-trails \
  --region us-east-1
```

Result: trail `apoth-staging-management-events`, home region `us-east-1`,
multi-region `true`, global service events `true`, log file validation `true`,
organization trail `false`.

```bash
AWS_PROFILE=apoth-staging aws cloudtrail get-trail-status \
  --name apoth-staging-management-events \
  --region us-east-1
```

Result: `IsLogging` is `true`; logging started at `2026-06-09T03:16:09Z`.

```bash
AWS_PROFILE=apoth-staging aws cloudtrail get-event-selectors \
  --trail-name apoth-staging-management-events \
  --region us-east-1
```

Result: `IncludeManagementEvents` is `true`, `ReadWriteType` is `All`, and no
data event resources are configured.

```bash
AWS_PROFILE=apoth-staging aws guardduty list-detectors --region us-east-1
AWS_PROFILE=apoth-staging aws guardduty get-detector \
  --detector-id a834cce0182642a2884136f8c0f152c0 \
  --region us-east-1
```

Result: detector `a834cce0182642a2884136f8c0f152c0` exists with status
`ENABLED` and finding publishing frequency `FIFTEEN_MINUTES`.

GitHub OIDC deploy-role verification captured on June 8, 2026:

```bash
AWS_PROFILE=apoth-staging aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn \
  arn:aws:iam::329425487030:oidc-provider/token.actions.githubusercontent.com
```

Result: provider URL `token.actions.githubusercontent.com`, client ID
`sts.amazonaws.com`, and CDK tags for `apoth:stage=staging`.

```bash
AWS_PROFILE=apoth-staging aws iam get-role \
  --role-name apoth-staging-github-oidc-cdk-deploy
```

Result: trust policy allows only `sts:AssumeRoleWithWebIdentity` from
`arn:aws:iam::329425487030:oidc-provider/token.actions.githubusercontent.com`
when `token.actions.githubusercontent.com:aud` is `sts.amazonaws.com` and
`token.actions.githubusercontent.com:sub` is
`repo:rolymoya/telehealth-ui:ref:refs/heads/main`.

```bash
AWS_PROFILE=apoth-staging aws iam get-role-policy \
  --role-name apoth-staging-github-oidc-cdk-deploy \
  --policy-name GithubActionsDeployRoleDefaultPolicy656FD013
```

Result: inline policy allows `sts:AssumeRole` only into these CDK bootstrap
roles:

- `cdk-hnb659fds-deploy-role-329425487030-us-east-1`
- `cdk-hnb659fds-file-publishing-role-329425487030-us-east-1`
- `cdk-hnb659fds-image-publishing-role-329425487030-us-east-1`
- `cdk-hnb659fds-lookup-role-329425487030-us-east-1`

It also allows `cloudformation:DescribeStacks` on `CDKToolkit` and
`Apoth-staging-ServerlessPlatform`, `ssm:GetParameter` for
`/cdk-bootstrap/hnb659fds/version`, `s3:ListBucket`/`s3:GetBucketLocation` on
`apoth-staging-static-assets`, `s3:PutObject`/`s3:DeleteObject` on objects in
that bucket, and `cloudfront:CreateInvalidation`/`cloudfront:GetInvalidation`
for account distributions so the static UI workflow can publish without
long-lived AWS keys.

Effective deploy permissions: the GitHub role has no attached managed policies
and no direct `AdministratorAccess`. The account-baseline stack defines
`arn:aws:iam::329425487030:policy/apoth-staging-cdk-cloudformation-execution-launch`
as the replacement policy for the CDK bootstrap CloudFormation execution role.
Before treating staging deploys as least-privilege or production-ready, deploy
the updated account-baseline stack, re-bootstrap with that policy, and verify
that `cdk-hnb659fds-cfn-exec-role-329425487030-us-east-1` no longer has
AWS-managed `AdministratorAccess`.

CDK bootstrap hardening procedure:

```bash
AWS_PROFILE=apoth-staging \
CDK_DEFAULT_ACCOUNT=329425487030 \
CDK_DEFAULT_REGION=us-east-1 \
npm --prefix infra exec -- cdk deploy Apoth-staging-AccountBaseline \
  --context stage=staging
```

```bash
AWS_PROFILE=apoth-staging \
CDK_DEFAULT_ACCOUNT=329425487030 \
CDK_DEFAULT_REGION=us-east-1 \
npm --prefix infra exec -- cdk bootstrap aws://329425487030/us-east-1 \
  --cloudformation-execution-policies \
  arn:aws:iam::329425487030:policy/apoth-staging-cdk-cloudformation-execution-launch
```

```bash
AWS_PROFILE=apoth-staging aws iam list-attached-role-policies \
  --role-name cdk-hnb659fds-cfn-exec-role-329425487030-us-east-1
```

Expected result: the attached policies include
`apoth-staging-cdk-cloudformation-execution-launch` and do not include
`AdministratorAccess`.

```bash
AWS_PROFILE=apoth-staging aws iam simulate-principal-policy \
  --policy-source-arn \
  arn:aws:iam::329425487030:role/cdk-hnb659fds-cfn-exec-role-329425487030-us-east-1 \
  --action-names ec2:CreateVpc rds:CreateDBInstance iam:CreateUser \
  --resource-arns '*'
```

Expected result: non-launch primitives such as VPC creation, RDS creation, and
IAM user creation are not allowed.

First GitHub-side OIDC smoke check is pending. Add a temporary workflow on
`main` or run the first deploy workflow with:

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: actions/checkout@v4
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::329425487030:role/apoth-staging-github-oidc-cdk-deploy
      aws-region: us-east-1
  - run: aws sts get-caller-identity
```

Expected smoke result: account `329425487030` with assumed role
`apoth-staging-github-oidc-cdk-deploy`. Do not add AWS access keys to GitHub
Secrets.

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
