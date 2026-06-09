# Staging CDK Deploy Handoff

Created: 2026-06-08
Related: `T-081`, `T-082`, `T-083`, `T-084`, `ISS-002`, `T-039`, `T-046`, `T-080`

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
   - Staging AWS account ID: `329425487030`
   - Staging region: `us-east-1`
   - AWS organization management account ID, if separate: `TODO`
   - Single-account launch decision: account `329425487030` is staging now
     and may host future production-stage resources once readiness gates are
     complete.

3. Confirm AWS Artifact / BAA status.
   - In the AWS management account, open AWS Artifact agreements.
   - Confirm the AWS BAA/organization agreement is accepted for the accounts
     that may hold PHI-adjacent staging/production state.
   - Record:
     - AWS BAA effective date: `June 8, 2026`
     - Evidence path/location:
       `AWS Artifact > Agreements > AWS Business Associate Addendum`
     - Covered account IDs: `329425487030`

4. Confirm human access baseline.
   - IAM Identity Center enabled: `yes`, instance
     `arn:aws:sso:::instance/ssoins-7223bfcc3b158a96`
   - MFA required for developer/admin users: `TODO account-wide`; developer
     access used SSO/MFA.
   - Long-lived IAM user access keys avoided/disabled for developers: `TODO yes/no`

5. Confirm baseline security services.
   - CloudTrail management events enabled in staging: `no`; CLI
     `describe-trails --include-shadow-trails` returned no trails.
   - GuardDuty enabled in staging: `no`; CLI `list-detectors` returned no
     detectors.
   - Security findings owner/contact path: `TODO`

6. Confirm or create deploy identity.
   - Developer CLI profile name to use locally: `apoth-staging`
   - Staging deploy/admin role ARN, if assuming a role:
     `arn:aws:sts::329425487030:assumed-role/AWSReservedSSO_AdministratorAccess_57fb0260b21e4638/roly-dev-sso`
   - GitHub Actions OIDC deploy role ARN, if already created: `TODO`
   - GitHub org/repo/branch/workflow subject restrictions: `TODO`

7. Fill the repo docs with non-secret values after verification.
   - `docs/runbooks/aws-account-baseline.md`
   - `docs/compliance/baa-register.md`

## Details To Fill For Codex CLI Takeover

Paste these values into the next thread, or update this file before asking
Codex to continue. Do not paste secrets.

```text
AWS_PROFILE=apoth-staging
AWS_REGION=us-east-1
STAGING_ACCOUNT_ID=329425487030
MANAGEMENT_ACCOUNT_ID=
PRODUCTION_ACCOUNT_ID=329425487030
AWS_BAA_EFFECTIVE_DATE=06/08/2026
AWS_BAA_EVIDENCE_LOCATION=AWS Artifact > Agreements > AWS Business Associate Addendum
STAGING_DEPLOY_ROLE_ARN=
GITHUB_OIDC_ROLE_ARN=
GITHUB_REPOSITORY=
GITHUB_BRANCH_OR_ENVIRONMENT=
SECURITY_FINDINGS_CONTACT=
```

If SSO is used, also provide:

```text
SSO_START_URL=https://ssoins-7223bfcc3b158a96.portal.us-east-1.app.aws
SSO_REGION=us-east-1
SSO_ACCOUNT_ID=329425487030
SSO_ROLE_NAME=AdministratorAccess
```

## Deployment Result

`Apoth-staging-ServerlessPlatform` has been deployed successfully.

- CDK bootstrap stack: `CDKToolkit`, status `CREATE_COMPLETE`.
- Application stack ARN:
  `arn:aws:cloudformation:us-east-1:329425487030:stack/Apoth-staging-ServerlessPlatform/47e5c000-63ac-11f1-9dcb-0afff611d6bb`
- Public health endpoint:
  `https://un74umczu7.execute-api.us-east-1.amazonaws.com/health`, verified
  response `{"ok":true}`.
- Scheduled heartbeat rule target:
  `arn:aws:lambda:us-east-1:329425487030:function:apoth-staging-scheduled-heartbeat`.

Stack outputs captured from CloudFormation:

```text
ApiEndpoint=https://un74umczu7.execute-api.us-east-1.amazonaws.com
AppTableName=apoth-staging-app
PatientUserPoolId=us-east-1_urOM8PctH
PatientUserPoolClientId=2i8kvm8c840gfou4qvlm67u2be
ScheduledHeartbeatFunctionName=apoth-staging-scheduled-heartbeat
ObservabilityDashboardName=apoth-staging-launch-observability
WebhookQueueArn=arn:aws:sqs:us-east-1:329425487030:apoth-staging-webhook-processing
WebhookDeadLetterQueueArn=arn:aws:sqs:us-east-1:329425487030:apoth-staging-webhook-dlq
MdiApiSecretArn=arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/mdi/api-NDEIUc
StripeSecretArn=arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/stripe/api-jGmsWe
AppSigningSecretArn=arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/app/signing-YtRbE6
```

Remaining staging account-baseline work:

- `T-082`: Enable CloudTrail management events and GuardDuty.
- `T-083`: Create least-privilege GitHub Actions OIDC deploy role.
- `T-084`: Confirm account-wide MFA/key posture, security findings contact,
  GitHub trust restrictions, and populate live secret values in AWS Secrets
  Manager only.

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
