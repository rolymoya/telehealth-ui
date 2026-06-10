# Data Classification Baseline

This map defines the launch data boundary before intake, webhook, dashboard,
and billing work begins. It is a technical implementation baseline, not legal
sign-off. Reconcile it with `docs/compliance/baa-register.md` before production
traffic and LegitScript submission.

Apoth's default posture is thin-PHI. MDI is the clinical system of record.
Apoth stores only minimal account, linkage, status, consent evidence, evidence
events, and webhook idempotency records unless a future architecture decision
and legal review explicitly expand that boundary.

## Classes

| Class | Meaning | Examples | Handling |
| --- | --- | --- | --- |
| Public | Safe for public site or client config | Marketing copy, public app URL, Cognito pool/client IDs | May appear in frontend config and docs |
| Confidential operational | Non-PHI operational data that still should not be public | Deployment IDs, queue names, status flags, opaque internal IDs | Keep out of user-visible copy unless intended; logs may include bounded opaque IDs only |
| Restricted secret | Credentials or signing material | MDI client secret, Stripe secret key, webhook signing secret, app signing secret | Secrets Manager or approved secret store only; never log |
| PHI-adjacent linkage | Minimal records that can connect a person to care or billing workflow | Cognito subject, MDI patient/case pointer, Stripe customer/subscription pointer, consent evidence, evidence event IDs, webhook event IDs | DynamoDB or AWS service state only; PHI-safe logs; no third-party metadata except opaque IDs |
| Clinical PHI | Questionnaire answers or care content | Conditions, symptoms, medications, diagnoses, clinician notes, messages, files, labs, photos | MDI-owned by default; do not persist in Apoth launch records or logs |

## System Map

| System | Owner / source of truth | Allowed data | Disallowed data | Classification | Encryption posture | Logging eligibility | Compliance caveat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cognito | AWS / Apoth identity | Email identity, password/MFA state, sessions, Cognito subject | Clinical answers, condition/medication context, MDI workflow content | PHI-adjacent linkage | AWS service-managed encryption | Cognito subject may appear only as an opaque ID when required; no email/name in app logs | AWS BAA/evidence must be active before production PHI-adjacent traffic |
| API Gateway | AWS / Apoth API boundary | Authenticated route requests, webhook requests, provider event envelopes in transit | Request/response body persistence, headers with secrets, query strings carrying patient data, clinical content in URLs | PHI-adjacent transit; may transiently carry clinical PHI during MDI handoff | AWS service-managed encryption for service data and CloudWatch access logs | Access logs are allowlist-only: request ID, route key, status, integration status, response length | AWS BAA/evidence must be active before production traffic; route design must keep patient data out of URLs |
| Lambda | AWS / Apoth runtime | Transient processing for intake handoff, dashboard reads, webhook verification, idempotency writes, MDI/Stripe calls | Local persistence of questionnaire answers, raw payload logging, temporary files containing PHI, clinical content in environment variables | PHI-adjacent runtime; may transiently handle clinical PHI before MDI submission | AWS service-managed encryption for service/runtime state and CloudWatch Logs; no app-level column/envelope encryption for launch | Use PHI-safe structured logs only; never log bodies, headers, exception stacks, or provider payloads | AWS BAA/evidence must be active before production traffic; each route/job must document minimized persistence |
| DynamoDB app table | Apoth | Profile/status records, MDI/Stripe pointers, consent evidence, evidence events, evidence uniqueness guards, evidence case-index pointers, webhook idempotency | Questionnaire answers, symptoms, diagnoses, medications, clinician notes, files/labs/photos, support free text, raw webhook payloads | PHI-adjacent linkage | AWS-managed DynamoDB encryption for launch | Opaque record type/status only; no raw keys, answers, payloads, support notes, or clinical fields | Customer-managed KMS only if counsel/evidence requires key separation or local clinical storage is approved later |
| MDI | MD Integrations | Clinical questionnaire answers, patient/case workflow, clinician/care content | Apoth secrets, Stripe payment instruments | Clinical PHI | MDI-controlled; track BAA/evidence separately | Apoth logs may include only sanitized MDI availability/status and opaque pointers | MDI BAA/evidence must be active before production clinical traffic |
| Stripe | Stripe | Payment method/customer/subscription IDs, invoices, charges, opaque Apoth metadata | Condition, medication, diagnosis, symptom, questionnaire answer, clinician note, MDI clinical status | Payment data; not PHI-approved | Stripe-managed | Stripe IDs only when needed; no PHI in metadata or logs; see `docs/stripe-data-policy.md` | Stripe is not BAA-eligible for launch, so keep metadata opaque and non-PHI |
| Secrets Manager | AWS / Apoth | Stage-scoped MDI, Stripe, webhook, and app signing secret payloads | Patient records, questionnaire answers, logs | Restricted secret | AWS-managed Secrets Manager encryption for launch; no custom `KmsKeyId` by default | Secret names/kinds may appear; secret values never appear | Customer-managed KMS only for explicit evidence/key-control requirement |
| SQS / DLQ | AWS / Apoth | Retry envelopes, opaque event IDs, minimized idempotency metadata | Raw questionnaire bodies, raw webhook payload archives, clinical free text | PHI-adjacent linkage if event pointers identify a care workflow | SQS-managed SSE for launch | Queue names/depth/age only; inspect payloads with PHI-safe runbook discipline | DLQ payload minimization is required before webhook work ships |
| CloudWatch logs | AWS / Apoth | Structured PHI-safe events, bounded metrics context, request IDs, route/status codes | Headers, bodies, query strings, email/name claims, raw errors, clinical/support free text, secret values | Confidential operational; may be PHI-adjacent by correlation | AWS service-managed CloudWatch encryption | Use `src/lib/observability/logging.ts`; deny free text by default | No external log shipping without approved BAA/compliance path |
| CloudWatch metrics / alarms / dashboards | AWS / Apoth | Bounded dimensions: `Stage`, `Provider`, `Outcome`, `ReasonCode`, `RouteGroup`; aggregate counts/latency | Patient IDs, event IDs, route params, condition/offering names, error messages | Confidential operational | AWS service-managed CloudWatch encryption | Metrics and dashboard titles only; no patient-specific dimensions | No SNS/email/pager actions until ops path and compliance review approve |
| Test fixtures | Apoth engineering | Synthetic IDs, fake secrets, non-real clinical examples marked as synthetic | Real PHI, real credentials, real vendor IDs | Confidential operational | Git plus local dev controls; no production data | Test output must not resemble live secrets or real patient data | Use obviously fake values; never copy sandbox patient data if it can identify a person |
| Future S3 / CloudFront static hosting | AWS / Apoth | Static exported public pages and assets | Authenticated patient data, questionnaire answers, raw webhook archives, PHI-bearing exports | Public by default | S3-managed encryption for static assets; CloudFront transport encryption | CDN/access logs must not include patient data in URLs | Customer-managed KMS required before any PHI-bearing object storage is approved |

## Customer-Managed KMS Triggers

AWS-managed service encryption is sufficient for launch while Apoth stores only
minimal PHI-adjacent linkage/status/evidence records and avoids PHI-bearing
object archives. Revisit customer-managed KMS keys if any of these become true:

- Counsel, BAA evidence, or a certification reviewer requires customer-managed
  key control for a specific AWS service.
- A future architecture decision approves storing clinical PHI in Apoth.
- Object storage will contain PHI-bearing exports, document snapshots, raw
  webhook payloads, or support evidence.
- Cross-account consumers or external processors require scoped key grants.
- Security policy requires separate key rotation, disablement, or key-access
  audit evidence beyond the AWS-managed baseline.

Do not add application-level envelope encryption or encrypted column wrappers
for launch records. If a future trigger requires stronger key control, document
the exact service, data class, key policy, rotation evidence, and operational
owner before implementation.
