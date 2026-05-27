# Runbook: AWS Account Setup

One-time manual steps for the Apoth AWS baseline. These steps cannot be automated by CDK because they precede the CDK bootstrap and require console access as the root or break-glass admin user.

Estimated time: 2–3 hours. Complete in order — each section depends on the previous.

---

## 1. Create the AWS Organization and member accounts

1. Log in to the management (root) account as root user with MFA enabled.
2. Go to **AWS Organizations → Create organization**.
3. Create three member accounts. Use a `+tag` email alias off the admin mailbox so each gets a unique root address:
   | Account | Email alias | Purpose |
   |---|---|---|
   | `apoth-prod` | `aws+prod@apothhealth.com` | Production workloads |
   | `apoth-staging` | `aws+staging@apothhealth.com` | Staging / QA |
   | `apoth-logging` | `aws+logging@apothhealth.com` | Centralized CloudTrail + GuardDuty sink |
4. Enable MFA on the root user of **each** member account (log in via root email + password reset).
5. Delete the default VPCs in all regions for all accounts (`aws ec2 delete-vpc` for each default — or use the console "Delete default VPC" button per region).

---

## 2. Enable IAM Identity Center

1. In the management account, go to **IAM Identity Center → Enable**.
2. Choose the Organization as the identity source (or connect to the company IdP if available).
3. Create two permission sets:
   | Permission set | Policy | Session duration |
   |---|---|---|
   | `ApothDeveloperAccess` | PowerUserAccess (AWS managed) | 8 hours |
   | `ApothReadOnly` | ReadOnlyAccess (AWS managed) | 8 hours |
4. Assign `ApothDeveloperAccess` to the apoth-staging account and `ApothReadOnly` to apoth-prod for developers.
5. Reserve direct console access to apoth-prod for break-glass scenarios only.

---

## 3. Sign the AWS BAA

1. In the management account, go to **AWS Artifact → Agreements → AWS Business Associate Addendum**.
2. Accept the BAA. AWS applies it to all accounts in the Organization.
3. Record in `docs/compliance/baa-register.md`:
   - Effective date (today)
   - Status: **Active**
   - Contact: AWS Enterprise Support ticket number or account rep name

---

## 4. Enable CloudTrail (all regions, all accounts)

1. In the management account, go to **CloudTrail → Create trail**.
2. Configure:
   - Name: `apoth-org-trail`
   - Apply to all accounts in organization: **Yes**
   - S3 bucket: `apoth-cloudtrail-logs` in the `apoth-logging` account
   - **Enable Object Lock on the S3 bucket** — compliance mode, 7-year retention (HIPAA audit trail requirement — logs must be immutable)
   - Enable log file validation: **Yes**
   - Include global service events: **Yes**
   - Multi-region trail: **Yes**
3. Enable CloudWatch Logs integration (log group: `/aws/cloudtrail/apoth-org`).
4. Verify: generate a test API call and confirm the event appears in the trail within 15 minutes.

---

## 5. Create the apoth KMS key

1. In apoth-prod, go to **KMS → Create key**.
2. Configure:
   - Type: Symmetric, Encrypt and decrypt
   - Multi-region: **Yes** (primary region: us-east-1)
   - Key alias: `alias/apoth`
   - Key rotation: **Enable automatic annual rotation** ← required
   - Key administrators: break-glass admin role only
   - Key users: App Runner task role, ECS worker task role (add after CDK deploy in T-039)
3. Record the key ARN — it will be passed as a prop to the CDK constructs.

---

## 6. Enable GuardDuty (all regions)

1. In the management account, go to **GuardDuty → Get Started → Enable GuardDuty**.
2. Enable as delegated administrator for the Organization; delegate to apoth-prod.
3. Auto-enable for new accounts: **Yes**.
4. Enable S3 Protection and EKS Protection (even if not used yet — cost is negligible).
5. Configure findings export: S3 bucket in `apoth-logging` account, prefix `guardduty/`.

---

## 7. Enable AWS Config (all regions)

1. In the management account, enable **AWS Config** with Organization-level aggregator.
2. Enable these managed rules in apoth-prod:
   - `s3-bucket-public-read-prohibited`
   - `encrypted-volumes`
   - `root-account-mfa-enabled`
   - `iam-password-policy`
   - `cloudtrail-enabled`
3. Set Config delivery to the `apoth-logging` S3 bucket with prefix `config/`.

---

## 8. Bootstrap CDK in each account

Run these commands after assuming credentials for each account via IAM Identity Center:

```bash
# apoth-prod (us-east-1)
AWS_PROFILE=apoth-prod npx cdk bootstrap aws://<prod-account-id>/us-east-1

# apoth-staging (us-east-1)
AWS_PROFILE=apoth-staging npx cdk bootstrap aws://<staging-account-id>/us-east-1
```

CDK bootstrap creates an IAM role (`cdk-hnb659fds-cfn-exec-role-*`) and an S3 bucket for assets. The GitHub Actions role (deployed by T-039) trusts these bootstrap roles.

---

## Verification checklist

- [ ] All three member accounts have root MFA enabled
- [ ] Default VPCs deleted in all accounts/regions
- [ ] IAM Identity Center enabled, permission sets created
- [ ] AWS BAA signed and recorded in baa-register.md
- [ ] CloudTrail org trail active, Object Lock enabled on S3 bucket
- [ ] apoth KMS key created with annual rotation enabled
- [ ] GuardDuty enabled org-wide, findings flowing to logging account
- [ ] AWS Config enabled with required rules
- [ ] CDK bootstrapped in prod and staging
