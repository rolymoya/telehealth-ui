# Staging Domain and Production Promotion

## Decision

Use `staging.apothhealth.com` for the existing staging stack and reserve
`apothhealth.com` plus `www.apothhealth.com` for production. Keep the stages on
separate CloudFront distributions, Cognito pools, DynamoDB tables, secrets, and
deployment roles.

A separate production AWS account is recommended before the first production
deployment. AWS accounts are security boundaries, and this is the least costly
time to separate production because no production state needs to be migrated.
The automation does not hard-code the production account ID, so it can also be
used with the documented single-account exception if the owner explicitly
accepts the weaker isolation.

## Staging Subdomain Setup

1. In ACM in `us-east-1` of staging account `329425487030`, request a public
   certificate for `staging.apothhealth.com`.
2. Add the ACM DNS-validation CNAME at Porkbun and wait for `ISSUED`. Keep this
   validation record permanently for managed renewal.
3. Add the certificate ARN as the GitHub repository variable
   `STAGING_CERTIFICATE_ARN`. Also add the existing public `pk_test_` value as
   `STAGING_STRIPE_PUBLISHABLE_KEY`; the workflow falls back to the current
   CloudFormation output when updating an existing stack.
4. Run the `Deploy staging infrastructure` workflow from `main`. It updates the
   account baseline, validates the certificate, attaches the staging hostname
   to CloudFront, and prints the distribution hostname in its job summary.
5. At Porkbun, add a `CNAME` record with host `staging` and the printed
   `d...cloudfront.net` hostname as the answer. Do not include `https://` or a
   path.
6. Run the `Deploy static UI` workflow. Verify `/`, `/about`, `/checkout`, and
   `/portal/launch` at `https://staging.apothhealth.com` with synthetic/test
   identities only.

The production certificate currently in staging account `329425487030` cannot
be attached to a CloudFront distribution in a different production account.
If production is split into its own account, request a new ACM certificate in
that account for both `apothhealth.com` and `www.apothhealth.com`.

## Recommended Account Layout

Use one AWS Organization with these workload accounts:

| Account | Purpose | Data posture |
| --- | --- | --- |
| Current account `329425487030` | Staging and synthetic integration testing | No real patient data or live vendor credentials |
| New production account | Public production site and production serverless stack | Production controls, live secrets, PHI-adjacent linkage records |

The production account needs IAM Identity Center access, MFA, CloudTrail,
GuardDuty, billing alerts, the AWS BAA/evidence path, CDK bootstrap resources,
and a production-only GitHub OIDC deploy role. Do not create long-lived GitHub
AWS access keys.

Bootstrap the new account once with an authorized human SSO profile:

```bash
export AWS_PROFILE=apoth-production
export PRODUCTION_ACCOUNT_ID="NEW_12_DIGIT_ACCOUNT_ID"
aws sso login --profile "$AWS_PROFILE"
AWS_PROFILE="$AWS_PROFILE" \
  npm --prefix infra exec -- cdk bootstrap \
  "aws://${PRODUCTION_ACCOUNT_ID}/us-east-1"
APOTH_ALLOW_PRODUCTION_SYNTH=true \
APOTH_PRODUCTION_ACCOUNT_ID="$PRODUCTION_ACCOUNT_ID" \
CDK_DEFAULT_ACCOUNT="$PRODUCTION_ACCOUNT_ID" \
CDK_DEFAULT_REGION=us-east-1 \
AWS_PROFILE="$AWS_PROFILE" \
  npm --prefix infra exec -- cdk deploy \
  --context stage=production \
  Apoth-production-AccountBaseline
```

If the single-account exception is retained, do not deploy a second copy of
the account-baseline stack without first refactoring its account-scoped OIDC,
CloudTrail, and GuardDuty resources. Create a separately protected production
deploy role against the shared baseline instead. This extra coupling is one
reason the separate production account is preferred.

## GitHub Configuration

Create a GitHub environment named `production`:

- Require a reviewer and prevent self-review when the repository plan supports
  those controls.
- Restrict deployments to `main`.
- Disable administrator bypass where supported.

Create these repository variables. None is secret material:

| Variable | Value |
| --- | --- |
| `PRODUCTION_AWS_ACCOUNT_ID` | 12-digit production account ID |
| `PRODUCTION_AWS_REGION` | `us-east-1` |
| `PRODUCTION_DEPLOY_ROLE_ARN` | `GithubActionsDeployRoleArn` from the production account-baseline stack |
| `PRODUCTION_CERTIFICATE_ARN` | Issued ACM certificate ARN from the production account in `us-east-1` |
| `PRODUCTION_CUSTOM_DOMAIN_READY` | `false` until Porkbun points at the production distribution, then `true` |
| `PRODUCTION_STRIPE_PUBLISHABLE_KEY` | Optional `pk_live_...` public key when the production client needs Stripe.js |

Deploy the production account baseline once with an authorized human SSO
profile to establish CloudTrail, GuardDuty, OIDC, and the deploy role. The
production role trusts only GitHub jobs using the protected `production`
environment.

## Promotion Flow

1. Merge reviewed code into `main`.
2. Let `Deploy static UI` publish that exact commit to staging and complete its
   staging smoke/E2E checks.
3. Copy the full 40-character commit SHA from the successful staging run.
4. Manually run `Promote production` from `main`, supply that SHA, and type
   `PROMOTE`.
5. The preflight job rejects commits outside `main` or without a successful
   staging deployment. It runs application and infrastructure tests and
   uploads the synthesized production CloudFormation template.
6. Review the release and approve the protected `production` environment.
7. The deployment job verifies the AWS account and ACM certificate, records
   the CDK diff, deploys the production stack, builds environment-specific
   static artifacts, snapshots both S3 buckets, publishes, invalidates
   CloudFront, and smoke-tests the distribution.
8. If a post-publish check fails, the workflow restores both UI buckets and
   invalidates CloudFront again. CloudFormation remains responsible for
   infrastructure deployment rollback.

The workflow intentionally rebuilds for production because Cognito IDs,
public origins, and other public client configuration are environment-specific.
The promoted unit is therefore the reviewed Git commit, not a byte-identical
staging bundle.

## First Production DNS Cutover

The first production workflow run uses the generated CloudFront hostname for
smoke tests while `PRODUCTION_CUSTOM_DOMAIN_READY=false`.

After it succeeds:

1. Read `StaticWebDistributionDomainName` from the production stack outputs.
2. At Porkbun, replace the parked root `A` records with a root `ALIAS` whose
   answer is that CloudFront hostname.
3. Replace the parked `www` record with a `CNAME` to the same hostname.
4. Keep all ACM validation records.
5. Set `PRODUCTION_CUSTOM_DOMAIN_READY=true`.
6. Re-run the production promotion for the same SHA. The workflow will also
   verify `https://apothhealth.com` and run the public production E2E suite.

## Rollback Policy

- UI failure: automatic restoration of the pre-deploy S3 snapshots.
- Infrastructure failure: CloudFormation rollback; inspect retained resources
  before retrying.
- Application regression after a successful deployment: promote the previous
  known-good SHA through the same workflow. Do not force-push or mutate a tag.
- Data/schema changes: forward-fix by default. Do not automatically delete or
  replace retained production Cognito, DynamoDB, SQS, or Secrets Manager
  resources.
