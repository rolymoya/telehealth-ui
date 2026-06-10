# Targeted AWS Security Baseline Handover

Date: 2026-06-08
Branch: `codex/architecture-reset-audit`
Session: `347b1048-a1f7-4e20-a8e3-408ecc22a36c`
Completed targets: `T-082`, `T-083`

## What changed

- `T-082` completed and committed as `e67c44c` (`feat: add AWS account security baseline (T-082)`).
- Added `Apoth-staging-AccountBaseline` CDK stack resources for:
  - retained S3 CloudTrail log bucket,
  - multi-region CloudTrail management-events trail,
  - GuardDuty detector in `us-east-1`.
- Deployed `Apoth-staging-AccountBaseline` to AWS account `329425487030` in `us-east-1`.
- Verified CloudTrail and GuardDuty live with AWS CLI.
- `T-083` completed and committed as `3ac9e37` (`feat: add GitHub OIDC deploy role (T-083)`).
- Extended `Apoth-staging-AccountBaseline` with:
  - GitHub Actions OIDC provider `arn:aws:iam::329425487030:oidc-provider/token.actions.githubusercontent.com`,
  - deploy role `arn:aws:iam::329425487030:role/apoth-staging-github-oidc-cdk-deploy`,
  - trust subject `repo:rolymoya/telehealth-ui:ref:refs/heads/main`.
- Verified the GitHub role has no attached managed policies and only an inline policy for CDK bootstrap role assumption plus bootstrap read calls.
- Updated `docs/runbooks/aws-account-baseline.md` and `docs/runbooks/staging-cdk-deploy-handoff.md` with outputs, verification commands, and remaining TODOs.
- Updated `ISS-002` to remove completed CloudTrail/GuardDuty and AWS-side GitHub OIDC-role gaps while keeping owner/manual confirmations open.
- Created `ISS-022` for the CDK bootstrap CloudFormation execution role still using AWS-managed `AdministratorAccess`.

## Important AWS outputs

- Account: `329425487030`
- Region: `us-east-1`
- Account-baseline stack ARN: `arn:aws:cloudformation:us-east-1:329425487030:stack/Apoth-staging-AccountBaseline/7ec00270-63b1-11f1-8e5c-12bdeb8afd65`
- CloudTrail name: `apoth-staging-management-events`
- CloudTrail bucket: `apoth-staging-cloudtrail-logs-329425487030-us-east-1-an`
- GuardDuty detector: `a834cce0182642a2884136f8c0f152c0`
- GitHub OIDC provider: `arn:aws:iam::329425487030:oidc-provider/token.actions.githubusercontent.com`
- GitHub deploy role: `arn:aws:iam::329425487030:role/apoth-staging-github-oidc-cdk-deploy`
- GitHub trust subject: `repo:rolymoya/telehealth-ui:ref:refs/heads/main`

## Verification run

- `npm --prefix infra test` passed: 2 files, 26 tests.
- `npm --prefix infra run build` passed.
- `CDK_DEFAULT_ACCOUNT=329425487030 CDK_DEFAULT_REGION=us-east-1 npm --prefix infra run synth -- --context stage=staging Apoth-staging-AccountBaseline` passed.
- `npm test` passed: 4 files, 112 tests.
- CDK diff/deploy passed for `Apoth-staging-AccountBaseline` during both T-082 and T-083.
- AWS CLI verified:
  - STS identity account `329425487030`,
  - CloudTrail trail exists and `IsLogging=true`,
  - CloudTrail event selector includes management events with `ReadWriteType=All`,
  - GuardDuty detector status `ENABLED`,
  - GitHub OIDC provider client ID `sts.amazonaws.com`,
  - GitHub role trust subject `repo:rolymoya/telehealth-ui:ref:refs/heads/main`,
  - GitHub role inline policy can assume only the four CDK bootstrap roles plus read `CDKToolkit`/bootstrap version.

## Decisions and caveats

- `T-084` was intentionally saved for later per user request. Do not work it until asked.
- Owner-selected GitHub environment/workflow-specific trust restrictions remain in `T-084` and `ISS-002`.
- First GitHub Actions OIDC smoke check could not be run locally; docs include the `aws-actions/configure-aws-credentials@v4` snippet and `aws sts get-caller-identity` check for the first workflow run.
- The GitHub role itself is not admin, but the CDK CloudFormation execution bootstrap role currently has AWS-managed `AdministratorAccess`; this is tracked in `ISS-022` and should be narrowed in a future hardening pass.
- Git emitted a pre-existing `.git/gc.log` / unreachable loose objects housekeeping warning during commits; not addressed.
- Pre-existing `.story/tickets/T-011.json` remains unstaged and was intentionally not included in either commit.

## Recommended next steps

1. Leave `T-084` parked until owner/manual confirmations are ready.
2. When ready for `T-084`, collect: MFA/key posture, security findings contact path, GitHub environment/workflow trust preference, and secret population readiness.
3. Run the first GitHub Actions OIDC smoke test from `main` before relying on CI deploys.
4. Address `ISS-022` in a future hardening ticket by narrowing the CDK CloudFormation execution role from `AdministratorAccess` to the launch resource set.
5. Revisit `ISS-002` only after `T-084`, the GitHub smoke check, and secret population are complete.