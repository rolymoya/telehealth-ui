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
| Staging | TODO: staging account ID | Pre-production Cognito, DynamoDB, Lambda/API Gateway, S3/CloudFront, Secrets, and webhook testing. | Should be safe for test patients and sandbox vendor credentials only. |
| Production | TODO: production account ID | Production patient account, linkage/status records, billing/webhook processing, and public hosting. | Must have AWS BAA evidence recorded before handling PHI-adjacent data. |

If launch starts with a single AWS account, separate staging and production by
explicit CDK stages, resource naming, IAM roles, and secrets. Split accounts
before production scale or external audit scope makes shared accounts risky.

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
| Staging deploy | TODO: staging deploy role ARN | TODO: GitHub org/repo/workflow subject | Least privilege for staging CDK deploys. |
| Production deploy | TODO: production deploy role ARN | TODO: GitHub org/repo/workflow subject | Production deploys should require protected branches and review gates. |

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

- [ ] TODO: Confirm staging account ID.
- [ ] TODO: Confirm production account ID or documented single-account launch
      exception.
- [ ] TODO: Confirm AWS BAA effective date in AWS Artifact.
- [ ] TODO: Record AWS BAA evidence path in `docs/compliance/baa-register.md`.
- [ ] TODO: Enable IAM Identity Center/SSO with MFA.
- [ ] TODO: Remove or disable long-lived developer IAM user keys.
- [ ] TODO: Create staging deploy role with GitHub OIDC trust.
- [ ] TODO: Create production deploy role with GitHub OIDC trust.
- [ ] TODO: Enable CloudTrail management events.
- [ ] TODO: Enable GuardDuty and route high-severity findings.
- [ ] TODO: Set CloudWatch log retention defaults for Lambda/API logs.
- [ ] TODO: Confirm Secrets Manager is the only credential store for vendor
      API secrets.
- [ ] TODO: Confirm no VPC, NAT, RDS, Redis, ECS, App Runner, or VPC endpoints
      are part of launch infrastructure.

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
