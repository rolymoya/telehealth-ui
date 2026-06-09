# Staging CDK Deploy Handoff

Created: 2026-06-08
Related: `T-081`, `ISS-002`, `T-039`, `T-046`, `T-080`

Use this handoff to bring the AWS staging environment up to date with the CDK
serverless platform stack currently defined in `infra/`.

## Goal

Deploy `Apoth-staging-ServerlessPlatform` to the intended staging AWS account
using a developer/admin identity, not the AWS root user. Keep secret values out
of Git; record only account IDs, role ARNs, evidence paths, and stack outputs.

## Manual Steps For User

1. Sign in with your developer/admin identity.
   - Prefer IAM Identity Center/SSO with MFA.
   - Do not use root for routine setup/deploy work.
   - Do not create or use root access keys.

2. Confirm the staging account.
   - Staging AWS account ID: `TODO`
   - Staging region: `TODO`, recommended default: `us-east-1`
   - AWS organization management account ID, if separate: `TODO`

3. Confirm AWS Artifact / BAA status.
   - In the AWS management account, open AWS Artifact agreements.
   - Confirm the AWS BAA/organization agreement is accepted for the accounts
     that may hold PHI-adjacent staging/production state.
   - Record:
     - AWS BAA effective date: `TODO`
     - Evidence path/location: `TODO`, for example `AWS Artifact > Agreements > ...`
     - Covered account IDs: `TODO`

4. Confirm human access baseline.
   - IAM Identity Center enabled: `TODO yes/no`
   - MFA required for developer/admin users: `TODO yes/no`
   - Long-lived IAM user access keys avoided/disabled for developers: `TODO yes/no`

5. Confirm baseline security services.
   - CloudTrail management events enabled in staging: `TODO yes/no`
   - GuardDuty enabled in staging: `TODO yes/no`
   - Security findings owner/contact path: `TODO`

6. Confirm or create deploy identity.
   - Developer CLI profile name to use locally: `TODO`, example `apoth-staging`
   - Staging deploy/admin role ARN, if assuming a role: `TODO`
   - GitHub Actions OIDC deploy role ARN, if already created: `TODO`
   - GitHub org/repo/branch/workflow subject restrictions: `TODO`

7. Fill the repo docs with non-secret values after verification.
   - `docs/runbooks/aws-account-baseline.md`
   - `docs/compliance/baa-register.md`

## Details To Fill For Codex CLI Takeover

Paste these values into the next thread, or update this file before asking
Codex to continue. Do not paste secrets.

```text
AWS_PROFILE=
AWS_REGION=us-east-1
STAGING_ACCOUNT_ID=
MANAGEMENT_ACCOUNT_ID=
PRODUCTION_ACCOUNT_ID=
AWS_BAA_EFFECTIVE_DATE=
AWS_BAA_EVIDENCE_LOCATION=
STAGING_DEPLOY_ROLE_ARN=
GITHUB_OIDC_ROLE_ARN=
GITHUB_REPOSITORY=
GITHUB_BRANCH_OR_ENVIRONMENT=
SECURITY_FINDINGS_CONTACT=
```

If SSO is used, also provide:

```text
SSO_START_URL=
SSO_REGION=
SSO_ACCOUNT_ID=
SSO_ROLE_NAME=
```

## Tasks Codex Can Do Via CLI

After you provide the filled values and authenticate the AWS CLI locally, Codex
can run the following from the repo root.

1. Verify local identity.

```bash
aws sts get-caller-identity --profile "$AWS_PROFILE"
```

2. Verify SSO login if needed.

```bash
aws sso login --profile "$AWS_PROFILE"
```

3. Install/check infra dependencies.

```bash
npm --prefix infra install
npm --prefix infra test
npm --prefix infra run build
```

4. Synthesize the staging stack.

```bash
CDK_DEFAULT_ACCOUNT="$STAGING_ACCOUNT_ID" \
CDK_DEFAULT_REGION="$AWS_REGION" \
npm --prefix infra run synth -- --context stage=staging
```

5. Check whether CDK bootstrap is needed.

```bash
AWS_PROFILE="$AWS_PROFILE" \
npm --prefix infra exec -- cdk bootstrap "aws://$STAGING_ACCOUNT_ID/$AWS_REGION"
```

If the account is already bootstrapped, CDK should report no meaningful changes.
If bootstrapping is not allowed by the developer role, the required action is to
ask an AWS admin to bootstrap or grant the needed bootstrap permissions.

6. Review the staging diff.

```bash
AWS_PROFILE="$AWS_PROFILE" \
CDK_DEFAULT_ACCOUNT="$STAGING_ACCOUNT_ID" \
CDK_DEFAULT_REGION="$AWS_REGION" \
npm --prefix infra run diff -- --context stage=staging
```

7. Deploy staging after reviewing the diff.

```bash
AWS_PROFILE="$AWS_PROFILE" \
CDK_DEFAULT_ACCOUNT="$STAGING_ACCOUNT_ID" \
CDK_DEFAULT_REGION="$AWS_REGION" \
npm --prefix infra exec -- cdk deploy Apoth-staging-ServerlessPlatform \
  --context stage=staging
```

8. Capture stack outputs.

```bash
AWS_PROFILE="$AWS_PROFILE" \
aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name Apoth-staging-ServerlessPlatform
```

Record output names and values, but do not record secret values.

## Tasks Codex Can Do Via Chrome

If you prefer browser-guided setup, Codex can use Chrome after you sign in.

Codex can help inspect and capture non-secret evidence from:

- AWS Artifact agreement status and evidence path.
- IAM Identity Center settings and assigned permission sets.
- CloudTrail status.
- GuardDuty status.
- CloudFormation stack events and outputs.
- CloudWatch alarms/dashboard presence.

Codex should not view, copy, or store:

- AWS access keys or secret access keys.
- Secret values in Secrets Manager.
- Patient data, questionnaire content, or vendor payload bodies.

## Expected Staging Stack Resources

The current CDK serverless baseline should create:

- Cognito patient user pool and app client.
- DynamoDB app table.
- Secrets Manager secret containers for MDI API, Stripe API, and app signing.
- Health Lambda and authenticated bootstrap Lambda.
- Scheduled heartbeat Lambda and EventBridge rule.
- HTTP API Gateway with public `/health` and JWT-protected `/app/bootstrap`.
- Webhook SQS queue and DLQ.
- CloudWatch log groups, alarms, and launch observability dashboard.

It should not create:

- VPC, NAT gateway, VPC endpoint.
- RDS/Postgres.
- Redis/ElastiCache.
- ECS/Fargate worker service.
- App Runner.
- Raw webhook payload archive bucket.

## Repo Updates After Deploy

After the staging deploy succeeds, update:

- `docs/runbooks/aws-account-baseline.md`
  - staging account ID
  - deploy role ARN/trust source
  - CloudTrail/GuardDuty status
  - checklist items that are truly complete

- `docs/compliance/baa-register.md`
  - AWS BAA effective date
  - staging/production account IDs, as available
  - AWS Artifact evidence path
  - AWS status from `pending` to `active` only if the BAA evidence really covers
    the relevant account(s)

- `.story/issues/ISS-002.json`
  - resolve only when all required real source values are recorded.

- `.story/tickets/T-081.json`
  - mark complete after staging deploy and documentation updates are committed.

## Stop Conditions

Stop and ask the user before proceeding if:

- The CLI identity account does not match `STAGING_ACCOUNT_ID`.
- CDK diff includes VPC, RDS, Redis, ECS, App Runner, NAT, VPC endpoints, or
  raw webhook archives.
- CDK bootstrap requires permissions the developer account does not have.
- AWS Artifact agreement status cannot be confirmed.
- Any step would expose or require pasting secret values into the repo or chat.
