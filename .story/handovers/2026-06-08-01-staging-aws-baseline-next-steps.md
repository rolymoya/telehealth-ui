# Staging AWS Baseline Handoff

Date: 2026-06-08
Branch: `codex/architecture-reset-audit`

## What changed

- AWS CLI SSO profile `apoth-staging` was configured and verified against AWS account `329425487030`.
- CDK bootstrap completed in `us-east-1`; bootstrap stack `CDKToolkit` is `CREATE_COMPLETE`.
- `Apoth-staging-ServerlessPlatform` deployed successfully to account `329425487030` in `us-east-1`.
- Public health endpoint verified: `https://un74umczu7.execute-api.us-east-1.amazonaws.com/health` returned `{"ok":true}`.
- Stack outputs were captured in `docs/runbooks/aws-account-baseline.md` and `docs/runbooks/staging-cdk-deploy-handoff.md`.
- AWS BAA register now records AWS as active with evidence path `AWS Artifact > Agreements > AWS Business Associate Addendum` and account `329425487030`.
- Single-account launch decision recorded: staging now and future production-stage resources later share account `329425487030`, separated by CDK stage/resource names and protected deploy roles until an account split is warranted.
- Local agreement PDFs and AWS installer package are ignored via `.gitignore`; do not commit BAA PDF contents.

## Storybloq updates

- `T-081` marked complete: staging CDK baseline deployed.
- Created follow-up tickets:
  - `T-082`: Enable CloudTrail and GuardDuty in the single AWS account.
  - `T-083`: Create GitHub OIDC deploy role for the single-account CDK pipeline.
  - `T-084`: Owner manual AWS baseline confirmations for single-account launch.
- `ISS-002` remains open but narrowed to remaining readiness gaps.

## Important current AWS outputs

- Account: `329425487030`
- Region: `us-east-1`
- API endpoint: `https://un74umczu7.execute-api.us-east-1.amazonaws.com`
- App table: `apoth-staging-app`
- Cognito user pool: `us-east-1_urOM8PctH`
- Cognito app client: `2i8kvm8c840gfou4qvlm67u2be`
- Scheduled heartbeat Lambda: `apoth-staging-scheduled-heartbeat`
- Dashboard: `apoth-staging-launch-observability`
- MDI secret ARN: `arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/mdi/api-NDEIUc`
- Stripe secret ARN: `arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/stripe/api-jGmsWe`
- App signing secret ARN: `arn:aws:secretsmanager:us-east-1:329425487030:secret:/apoth/staging/app/signing-YtRbE6`

Do not record or paste secret values. Populate live values only in AWS Secrets Manager.

## Recommended next steps for new thread

1. Work `T-084` just enough to collect owner decisions:
   - security findings contact path,
   - GitHub repo and deploy trust restriction (`owner/repo`, branch/environment/workflow),
   - confirmation of account-wide MFA posture,
   - confirmation no long-lived developer IAM user keys are active/needed,
   - which staging secret values are ready to populate in AWS Secrets Manager.

2. Work `T-082`:
   - Prefer adding a small `AccountBaselineStack` or similarly named CDK stack for CloudTrail and GuardDuty rather than doing one-off console state.
   - Keep it lean: CloudTrail management events, GuardDuty detector in `us-east-1`, and documented finding owner/contact path.
   - Verify with AWS CLI and update `docs/runbooks/aws-account-baseline.md`, `docs/runbooks/staging-cdk-deploy-handoff.md`, and `ISS-002`.

3. Work `T-083`:
   - Create/manage GitHub OIDC provider for `token.actions.githubusercontent.com` if absent.
   - Create a same-account deploy role restricted to the chosen repository and branch/environment/workflow.
   - Document role ARN and trust source.
   - Avoid AWS access keys in GitHub secrets.

4. After `T-082`, `T-083`, and `T-084` are complete, revisit `ISS-002` and resolve it only if all required real evidence values are recorded.

## Validation already run

- `npm --prefix infra test` passed: 20 tests.
- `npm --prefix infra run build` passed.
- CDK synth/diff/deploy passed for staging.
- `curl` health endpoint check passed.
- Storybloq validation passed with unrelated pre-existing warnings about other open issues lacking related tickets.

## Local working tree notes

Before this handoff, unrelated dirty files existed and should not be swept into AWS commits unless intentionally reviewed:

- `.story/tickets/T-011.json`
- old untracked `.story/handovers/2026-06-04-*` and `2026-06-05-*` files

The AWS BAA PDF and AWS CLI installer are ignored locally and should remain uncommitted.
