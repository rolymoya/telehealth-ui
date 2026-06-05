# BAA Register

This register tracks vendors that receive, maintain, or transmit PHI for the
Apoth launch architecture. Apoth's default posture is thin-PHI: MDI is the
clinical system of record, Apoth stores only minimal linkage/status records,
and Stripe receives only opaque non-PHI identifiers.

Do not treat a vendor as approved for PHI until its status is `active` and an
evidence location is recorded.

| Vendor | Launch role | PHI boundary | Status | BAA effective date | Account or vendor identifier | Evidence location | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AWS | Hosting, Cognito, DynamoDB, Lambda/API Gateway, S3/CloudFront, Secrets Manager, SQS/DLQ, EventBridge, CloudWatch | May receive or maintain PHI-adjacent account/linkage/status records. Questionnaire answers should not be retained after MDI submission. | pending | TODO: AWS BAA effective date | TODO: staging account ID; TODO: production account ID | TODO: AWS Artifact BAA evidence path | Apoth Health LLC | Use managed encryption and PHI-safe logs. No RDS, Redis, ECS, App Runner, NAT gateways, or VPC endpoints for launch. |
| MD Integrations | Clinical system of record, questionnaire intake destination, clinician/case workflow, clinical status and workflow URLs | Receives clinical questionnaire responses and clinical workflow data. | pending | TODO: MDI BAA effective date | TODO: MDI partner/vendor identifier | TODO: signed agreement or vendor evidence path | Apoth Health LLC | Apoth should store MDI patient/case pointers only, not questionnaire answers. |
| 503A pharmacy partner | Dispensing and fulfillment for compounded medication where applicable | May receive prescription/fulfillment PHI through MDI or an approved partner workflow. | pending | TODO: pharmacy BAA effective date | TODO: pharmacy legal name and identifier | TODO: signed agreement or vendor evidence path | Apoth Health LLC | Partner name is TBD. Direct pharmacy API integration is out of launch scope unless a concrete gap reintroduces it. |
| Stripe | Payment method collection, customer/subscription billing, refunds, dunning | Not BAA eligible for launch. Do not send PHI to Stripe. | restricted | Not applicable | TODO: Stripe account ID | TODO: Stripe account evidence path | Apoth Health LLC | Stripe metadata must contain only opaque IDs. No condition, medication, diagnosis, symptom, questionnaire answer, clinician note, or patient health context. |

## Evidence Rules

- Record exact account IDs, dates, and evidence paths from source systems only.
- Never paste secrets, API keys, access tokens, patient data, questionnaire
  answers, clinician notes, or raw webhook payloads into this file.
- If a vendor is pending, keep launch code paths from sending PHI to that
  vendor until the BAA/compliance path is active.
- Re-review this register before LegitScript submission and before production
  traffic.
