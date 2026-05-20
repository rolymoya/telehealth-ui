# Apoth — End-to-End Architecture Plan

## Context

Apoth (Apoth Health LLC, Illinois) is a patient-facing telehealth product currently shipped as a static Next.js 16 marketing surface. The next chapter turns it into a small full-stack app that can:

1. Create and authenticate patient accounts.
2. Verify identity to LegitScript-grade.
3. Accept Stripe payments and subscriptions, with the hard promise that **no card is charged before clinical confirmation** (RULES.md).
4. Hand patients off to **MDIntegrations** (independent third-party physician group) for clinical intake, prescription, and refill management.
5. Fulfill prescriptions via a 503A compounding pharmacy partner (TBD).

The architectural job is to be a thin, evidence-producing orchestration layer between three boundaries Apoth does not own — **identity** (better-auth + KYC), **money** (Stripe), and **clinical truth** (MDI → DoseSpot → pharmacy) — while keeping PHI inside BAA boundaries and producing the controls evidence LegitScript will ask for.

**PHI posture (decided)**: minimal PHI in Apoth's DB. We hold identity + payment + thin pointers (`mdi_patient_id`, `mdi_case_id`, `stripe_customer_id`). Full PHI lives in MDI.

---

## 1. AWS Topology

Hosted entirely inside a HIPAA-eligible AWS account with a signed AWS BAA.

| Layer | Service | Notes |
|---|---|---|
| Edge | CloudFront + WAF | Marketing pre-rendered, cached at edge. WAF managed rules + Stripe IP allowlist on `/api/webhooks/stripe`. |
| App | App Runner (or ECS Fargate if WAF needs exceed App Runner) | Single Next.js service. Two route groups: `(marketing)` static, `(app)` dynamic. |
| DB | RDS Postgres 16, Multi-AZ, KMS-encrypted, PITR 35d | Private subnet. |
| Cache | ElastiCache Redis | better-auth session cache, MDI token cache, webhook idempotency hot path. |
| Queue | SQS + DLQ | Inbound webhook deferral. |
| Workers | ECS Fargate service | Same image as web, different entrypoint. Consumes SQS, runs EventBridge-scheduled jobs. |
| Storage | S3 (KMS-encrypted) | Webhook payload archive, KYC document pre-handoff, audit-log exports. |
| Secrets | AWS Secrets Manager | One secret per integration per env. App Runner task role scoped by ARN. Rotation on DB + better-auth signing secret. |
| Observability | CloudWatch + OTEL → Datadog (BAA) | Sentry frontend-only with PHI scrubber. |
| IaC | CDK in TypeScript | `/infra` directory, shared language with app. |

**Why not Vercel**: BAA scope narrower and pricier; webhook latency + worker model fit AWS-native better. Marketing DX delta is small once routes are statically pre-rendered behind CloudFront.

**BAA boundary**: RDS, S3 PHI buckets, App Runner, ECS workers, SQS, Redis, CloudWatch, Datadog, MDI, KYC vendor (Persona), pharmacy partner.
**Outside BAA**: Stripe (no PHI in metadata/descriptors/line items), GitHub, Sentry (frontend, scrubbed), Vercel preview builds (non-prod, no real PHI).

---

## 2. Vendor Stack (Decided)

| Concern | Vendor | Notes |
|---|---|---|
| Auth | **better-auth** (self-hosted) | TypeScript-native library. Users + sessions in our Postgres. Library not service → low swap cost. |
| Payments | **Stripe** | Per-condition subscription model. No trials in v1. Customer Portal for self-serve cancel/payment-method-update. **No BAA** — keep PHI out. |
| KYC | **Persona** (recommended; confirm BAA before Phase C) | Hosted Inquiry flow. Pre-payment placement. `lib/kyc/provider.ts` facade for swap. |
| Clinical | **MDIntegrations** | REST + 40+ webhooks. OAuth client credentials (no refresh tokens). Embedded URLs for sensitive sub-flows. |
| Pharmacy | **MDI passthrough v1** | Direct integration only when a concrete gap appears. |

### better-auth specifics

- Email + password (v1), magic link (recovery), TOTP MFA (required before viewing case detail).
- Passkeys: Phase A.5, post-launch.
- Database-backed sessions (Postgres), Redis read-through cache.
- **Skip the Stripe plugin** — wrong shape; we want Stripe customer created after consents, not at signup.
- All auth calls go through `src/lib/auth.ts` facade (lint-enforced).

### Stripe specifics

- **Per-condition subscription** — one Stripe `Subscription` per condition treated. Maps 1:1 to MDI cases.
- **Payment-gate via SetupIntent**, not trials. Capture payment method during onboarding; create the subscription only when MDI emits `case_completed` with an Rx. Enforces the "no charge before clinical confirmation" promise structurally.
- Customer Portal: payment-method update + cancellation only. **No plan switching** in the portal (clinical implication; force through our UI to re-check eligibility).
- Stripe metadata: only opaque `apoth_user_id` / `apoth_case_id`. No condition names, no diagnosis, no DOB.
- Webhook handlers: `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `payment_method.attached`, `setup_intent.succeeded`, `charge.refunded`, `charge.dispute.created`.

### MDIntegrations specifics

- Token cached in Redis (TTL = `expires_in - 60s`), shared across processes. On 401: force-refresh once, retry once, fail loud.
- **Single client** at `src/lib/mdi/client.ts` — every MDI call routes through it. Lint-enforced.
- Webhook receiver at `/api/webhooks/mdi`: verify HMAC-SHA256 (`Signature`) + bearer (`Authorization`) → upsert into `webhook_events` keyed on MDI event id → drop payload to S3 → enqueue minimal envelope to SQS → 200 in <500ms.
- Worker applies events idempotently. **Out-of-order events**: compare `mdi_updated_at` to `cases.mdi_updated_at`; drop stale.
- **418 (maintenance)** on outbound: exponential backoff w/ jitter, max ~10 min, then mark op `mdi_unavailable` and surface maintenance banner via feature flag. Critical writes queued and replayed.
- **Embedded URLs** for: driver-license capture (clinical artifact, separate from KYC), face-photo, intake medical questionnaire, clinician messaging, file uploads. Request fresh per render via server action.
- **Custom UI** for: signup, consents, condition selection, state gate, payment.
- Case status mirroring is webhook-driven; 6h reconciliation pull as fallback.
- Sandbox in separate AWS account (or at minimum separate VPC + DB). Boot-time sentinel check prevents cross-env secret leakage.

### Persona specifics

- Hosted Inquiry flow (not embedded SDK — keeps KYC liability out of our boundary).
- Webhook at `/api/webhooks/persona` → update `kyc_verifications`.
- Placement: signup → consents → **KYC** → intake → payment → MDI handoff. Declined KYC produces no Stripe customer, no MDI patient.
- MDI's embedded driver-license capture does **not** substitute for KYC — LegitScript wants identity-of-record as a distinct documented control.

---

## 3. Patient Journey

```
Marketing (/)
  └─ /get-started
      └─ /signup                [better-auth: email+password, MFA opt]
          └─ /onboarding/consents     [ToS + NPP + Telehealth, versioned]
              └─ /onboarding/identity [Persona hosted flow → return URL]
                  └─ /onboarding/intake    [our minimal form: condition + state gate]
                      └─ /onboarding/payment [Stripe SetupIntent — payment method captured, NOT charged]
                          └─ [server action] create MDI patient + case → patient_links, cases
                              └─ /dashboard  [case-status mirror; embedded MDI URLs for clinical sub-flows]
                                  └─ [webhook: case_completed + Rx] → activate Stripe subscription + create MDI subscription
                                      └─ Pharmacy fulfillment via MDI passthrough
                                          └─ Refill loop (Stripe renews → MDI subscription event → pharmacy ships)
```

---

## 4. Data Model (Postgres, owned tables)

Single schema `apoth`. Sensitive columns use **application-level KMS envelope encryption** (not `pgcrypto`).

| Table | Owner | Purpose |
|---|---|---|
| `users`, `accounts`, `sessions`, `verifications`, `passkeys`, `two_factor` | better-auth | Standard better-auth tables. |
| `user_profiles` | us | first/last name, DOB, phone, address, state. DOB/phone/address KMS-encrypted. |
| `consent_documents` | us | version, kind (`tos`/`npp`/`telehealth`/`marketing`), sha256, s3_key, effective_from. |
| `consents` | us | user_id, kind, document_version, granted_at, ip, user_agent, revoked_at. Append-only via app logic. |
| `kyc_verifications` | us | user_id, vendor, vendor_reference_id, status, verified_at, expires_at, raw_payload_s3_key. |
| `patient_links` | us | user_id (UNIQUE) ↔ mdi_patient_id ↔ stripe_customer_id. |
| `cases` | us (mirror) | user_id, mdi_case_id, status (mirror), primary_disease, offering_ids[], last_synced_at, mdi_updated_at. **Mirror, not source of truth.** |
| `subscriptions` | us (mirror) | user_id, stripe_subscription_id, stripe_price_id, mdi_subscription_id, status (mirror), current_period_end, condition_key. |
| `billing_events` | us | source (`stripe`/`mdi_partner_charge`/`pharmacy`), external_id, user_id, case_id, subscription_id, amount_cents, occurred_at. Unit-economics ledger. |
| `webhook_events` | us | id = provider event id (PK → idempotent), provider, signature_verified, received_at, processed_at, status, attempts, payload_s3_key. |
| `audit_log` | us | ULID, actor, action, resource, ip, ua, **prev_hash + this_hash** (SHA-256 chain → tamper-evident). |
| `feature_flags` | us | name, enabled, rollout_pct. |

**PHI-bearing columns** decrypt only inside server actions / route handlers that simultaneously write to `audit_log`. Plaintext never leaves request scope.

`audit_log` ships to **both** Postgres (queryable) and CloudWatch (immutable, 7yr retention via log-group resource policy).

---

## 5. Cross-cutting Concerns

### Reconciliation

| Field | Source of truth | Drift handling |
|---|---|---|
| Identity (email, password) | better-auth → our DB | n/a |
| KYC status | Persona | hourly reconciler for `pending` >24h |
| Subscription billing | Stripe | webhook + 6h reconcile pull |
| Case + Rx state | MDI | webhook + 6h reconcile pull, alarm on drift |
| MDI subscription (refill cadence) | MDI | webhook + reconcile |
| Clinical PHI (history, labs, messages) | MDI | **never persisted**; read on demand |

**Stripe ↔ MDI subscription**: 1:1. Create MDI subscription immediately after Stripe subscription activation, store cross-IDs in both metadata fields. Nightly reconciler alarms on unpaired rows >1h.

### Three billing surfaces (unit economics)

`billing_events` ledger captures: **revenue** (Stripe `invoice.paid`), **MDI wholesale** (`partner_charge`), **pharmacy cost** (Phase E — initially via MDI reporting). Per-case PnL via Metabase/Sigma view; no custom finance UI in v1.

### Audit logging

Logged: every auth event, consent grant/revoke, PHI read, state-changing webhook applied, admin action. Hash chain in Postgres; immutable CloudWatch sink. Nightly `audit-chain-verify` job alarms on broken chains.

### Background jobs (ECS Fargate worker)

Single worker service consuming SQS + EventBridge schedules:

- `mdi-token-prewarm` (30 min)
- `webhook-processor` (continuous SQS consumer)
- `reconcile-stripe-mdi` (6h)
- `reconcile-kyc-pending` (1h)
- `audit-chain-verify` (nightly)
- `dunning-sync` (daily — Stripe `past_due` → notify + pause MDI subscription)

### Environments

| Env | App | Stripe | MDI | KYC |
|---|---|---|---|---|
| local | localhost | test | sandbox | sandbox |
| preview | App Runner preview | test | sandbox | sandbox |
| staging | staging.apoth.com (basic auth) | test | sandbox | sandbox |
| prod | apoth.com | live | prod | prod |

Boot-time sentinel check on each integration's env tag → hard exit on mismatch.

---

## 6. Phasing

| Phase | Scope | Duration |
|---|---|---|
| **Phase 0 (spike, parallel to A)** | MDI sandbox proof-of-concept: auth → create patient → create case → ngrok webhook receiver → observe what events actually fire. **Deliverable**: `docs/external/mdi-event-catalog.md` capturing real-world payload shapes per event. Cuts the biggest Phase D unknown. | 3–5 days |
| **A — Foundation** | AWS infra (CDK), RDS, App Runner, Secrets, CI/CD, observability skeleton, better-auth (email+password+MFA), `users`/`sessions`/`consents`/`audit_log` schemas, `lib/auth.ts` facade, marketing routes moved into `(marketing)` group. **Exit**: signup → consents → signin → audit row asserted. | 2–3 weeks |
| **B — Stripe primitives** | Customer creation, SetupIntent flow, per-condition subscription model, webhook receiver w/ idempotency, Customer Portal, `billing_events` ledger. No MDI yet. **Exit**: test-mode flow creates customer → captures payment method → creates subscription on manual trigger → handles `invoice.payment_failed`. | 2 weeks |
| **C — KYC** | Persona Inquiry flow, webhook receiver, `kyc_verifications` schema, slot into onboarding before payment. **Exit**: KYC pass/fail gates progression; declined users get clear path; webhook idempotent. | 1–2 weeks (gated on Persona BAA) |
| **D — MDI** (highest risk) | Token client, patient/case creation, all 40+ webhook event types triaged (must-handle / safe-to-ignore / route-to-ops), embedded URL helpers, case mirroring, reconciliation. Wires Phase B's deferred subscription activation to `case_completed`. **Exit**: sandbox patient goes signup → `case_completed` → correct Stripe activation → audit chain unbroken. | 3–4 weeks |
| **E — Pharmacy** | MDI passthrough only; direct pharmacy API deferred until a concrete gap is named. | 1–2 weeks |
| **F — Hardening + LegitScript prep** | Reconciliation jobs production-grade, drift dashboards, dunning, audit-log evidence export tool, consent re-prompt on version bump, retention/deletion policy, pen test, LegitScript application package. | 2–3 weeks |

---

## 7. Files to Create / Modify

### Existing structure to reuse / preserve

- `src/app/page.tsx`, `src/app/about/`, `src/app/privacy/`, `src/app/terms/`, `src/app/get-started/` — move into `src/app/(marketing)/` route group during Phase A. Keep `RULES.md` design constraints (Committed Clay, Two-Voice, Serif-Lead, etc.) and the `LegalReviewBanner` on /privacy and /terms.
- `src/lib/data.ts` — static marketing data, untouched.
- `src/components/` — existing components untouched until they need to render dynamic state (then promote to client components only where needed).
- `docs/features/improve-LegitScript-compliance.md` pattern — continue using per-branch feature docs for non-trivial work.
- `docs/external/MD Integrations API.postman_collection.json` — primary MDI reference; pin its version, note any API drift in `docs/external/mdi-changes.md`.

### Phase A — Foundation

- `infra/` — CDK app: VPC, RDS, App Runner, Secrets, SQS, ECS worker, CloudFront, WAF.
- `src/middleware.ts` — session check, MFA gate for `/dashboard/**`, onboarding-step gates, redirects.
- `src/lib/auth.ts` — better-auth instance + facade (`getSession`, `requireUser`).
- `src/lib/db/client.ts` — Postgres client. **Recommend Drizzle** (migrations + types in TS).
- `src/lib/db/schema/{users,sessions,user_profiles,consents,consent_documents,audit_log}.ts`.
- `src/lib/crypto/kms.ts` — KMS envelope encryption helper.
- `src/lib/audit.ts` — `recordAuditEvent`, hash chain logic.
- `src/lib/consents/grant.ts` — consent-granting server action with audit.
- `src/app/api/auth/[...all]/route.ts` — better-auth handler.
- `src/app/(app)/signup/page.tsx`, `signin/page.tsx`, `layout.tsx`.
- `src/app/(app)/onboarding/consents/page.tsx`.
- `.github/workflows/deploy.yml`.

### Phase B — Stripe

- `src/lib/stripe/{client,customer,subscription}.ts`.
- `src/lib/db/schema/{subscriptions,billing_events,webhook_events}.ts`.
- `src/app/api/webhooks/stripe/route.ts`.
- `src/app/(app)/onboarding/payment/page.tsx`.
- `src/app/(app)/billing/page.tsx` (Customer Portal redirect).
- `workers/src/handlers/stripe.ts`.

### Phase C — KYC

- `src/lib/kyc/provider.ts` (interface), `src/lib/kyc/persona.ts` (impl).
- `src/lib/db/schema/kyc_verifications.ts`.
- `src/app/api/webhooks/persona/route.ts`.
- `src/app/(app)/onboarding/identity/page.tsx`, `identity/return/page.tsx`.

### Phase D — MDI

- `src/lib/mdi/{client,patients,cases,subscriptions,files,embedded,webhook-verify}.ts`.
- `src/lib/db/schema/{patient_links,cases}.ts`.
- `src/app/api/webhooks/mdi/route.ts`.
- `workers/src/handlers/mdi/{case-lifecycle,partner-charge,messages,files,vouchers,subscriptions}.ts`.
- `src/app/(app)/onboarding/intake/page.tsx`.
- `src/app/(app)/dashboard/page.tsx`, `dashboard/cases/[caseId]/page.tsx`.
- `workers/src/jobs/reconcile-mdi.ts`.

### Phase F — Hardening

- `src/app/admin/audit/[userId]/page.tsx` (staff role + step-up MFA).
- `workers/src/jobs/audit-chain-verify.ts`.
- `docs/legitscript/` — submission package, evidence runbooks, retention policy.

### Critical files (highest blast radius — review carefully on every change)

- `src/lib/auth.ts` — the swap-cost insulator.
- `src/lib/mdi/client.ts` — every MDI call routes through here.
- `src/app/api/webhooks/mdi/route.ts` — signature verify + idempotent enqueue.
- `src/lib/db/schema/` — schema decisions ripple everywhere.
- `src/middleware.ts` — the journey enforcer (session + MFA + onboarding gates).

---

## 8. Open Decisions / Risks

| Item | Status | Action |
|---|---|---|
| KYC vendor confirmation | Persona recommended | Confirm BAA terms before Phase C kickoff. |
| MDI BAA | Required before Phase D | Block kickoff until executed. |
| Pharmacy partner | TBD | Required before Phase E; passthrough until then. |
| Stripe BAA | Confirmed unavailable | Architectural constraint — no PHI in Stripe metadata/descriptors/line items. |
| Consent versioning UX | Designed | Re-prompt at next login when `consent_documents.version` bumps. |
| Audit-log evidence query | Phase F | Admin timeline view per user. |
| Retention policy | Draft | Mirror rows soft-deleted within 30d of MDI deletion; hard-deleted at 7yr (matches audit). |
| State-availability gating | LegitScript req | Record refusal as audit row, not just UI block. |
| MDI event semantics | Phase 0 spike | Real-world catalog of webhook payloads to write before Phase D. |
| Drizzle vs Kysely | Drizzle | Migrations + types in TS; revisit only if a concrete pain appears. |

---

## 9. Verification

### Local dev

- Docker Compose: Postgres 16, Redis, LocalStack (SQS, S3, Secrets Manager).
- Seed script: test user, consent_documents, test subscription prices.
- `pnpm dev` (web) + `pnpm dev:worker` (worker against LocalStack SQS).

### Webhook tunneling

- **Stripe**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Persona**: ngrok / Cloudflare Tunnel; register URL in Persona dashboard.
- **MDI**: no CLI. Two paths:
  - ngrok URL registered in MDI sandbox dashboard for live exploratory dev.
  - **Fixture replayer** (Phase 0 deliverable): canned payloads in `tests/fixtures/mdi/*.json`, signed with test secret, POSTed to local route. Integration tests rely on fixtures, not live sandbox.

### Integration test matrix (one per phase, in CI)

- **A**: signup → consent → signin → audit row asserted; consent re-prompt on version bump.
- **B**: SetupIntent → manual subscription create → `invoice.paid` webhook → `subscriptions` row mirrors → portal cancel → cancel mirrored.
- **C**: start KYC → Persona webhook (fixture) → status update → onboarding unblocked.
- **D**: full journey using MDI sandbox + replayed webhooks → `case_completed` → subscription activated → audit chain unbroken.

### Sandbox separation

Boot-time sentinel check: `STRIPE_ENV`, `MDI_ENV`, `PERSONA_ENV` must all match `APP_ENV`. Mismatch → hard exit.

### Production smoke

Weekly synthetic: signs up `+synthetic@apoth.com`, runs onboarding with designated test KYC profile (Persona supports test inquiries), captures test payment method, tears down. Hits real prod with test-mode integrations behind a feature flag — catches deploy-time wiring breaks that staging misses.

### TDD per RULES.md

Write tests **first** for: clinical eligibility screening, state-availability gating, and the **"no card charged before clinical confirmation"** invariant. These tests define the contract that the SetupIntent + `case_completed`-gated subscription activation must satisfy.
