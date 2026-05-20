# Handover — Architecture plan → roadmap

## Session summary

Translated the end-to-end architecture plan at
`/Users/roly/.claude/plans/this-telehealth-ui-needs-frolicking-iverson.md`
into storybloq tickets. The marketing-site roadmap is now a full-stack
roadmap: 75 tickets across 13 phases, covering auth, payments, KYC,
MDIntegrations, pharmacy fulfillment, AWS infrastructure, and LegitScript
hardening.

## Architecture decisions baked into the roadmap

- **Auth**: better-auth, self-hosted on AWS (not Clerk). All auth calls
  through `src/lib/auth.ts` facade (swap-cost insulator).
- **Payments**: Stripe with per-condition subscription model. SetupIntent
  captures payment method during onboarding; subscription is created only
  when MDI emits `case_completed`. Enforces RULES.md's "no card charged
  before clinical confirmation" structurally, not via Stripe trials.
- **KYC**: Persona hosted Inquiry (recommended; BAA pending). Sits before
  payment in the onboarding journey; declined KYC produces no Stripe
  customer and no MDI patient.
- **Clinical**: MDIntegrations. OAuth client credentials, single HTTP
  client at `src/lib/mdi/client.ts` (lint-enforced), 40+ webhooks
  received → SQS → worker. Case status is mirrored, not authoritative.
  Deep clinical questionnaire happens in MDI's embedded UI; our intake is
  minimal (condition + state gate + light prefilter).
- **Pharmacy**: 503A compounding partner, fulfillment via MDI passthrough
  in v1. Direct integration deferred.
- **PHI posture**: minimal in our DB — identity + payment + thin pointers
  (`mdi_patient_id`, `stripe_customer_id`, `mdi_case_id`). Full PHI lives
  in MDI. Stripe metadata holds only opaque `apoth_user_id`.
- **Hosting**: AWS-native (CDK + App Runner + RDS Postgres + ECS worker
  + SQS + ElastiCache Redis + KMS + CloudFront + WAF). Datadog observability
  with BAA.
- **Compliance plumbing**: KMS envelope encryption for PHI-adjacent
  columns; tamper-evident audit-log hash chain; versioned consent
  documents stored in S3 with sha256 evidence.

## What changed in storybloq

### Phase changes
Inserted 5 new phases (no phase-reorder tool exists in storybloq, so they
landed at their `after` positions — see *Known artifact* below):

- **Infrastructure** (T-038–T-047 + relocated T-017) — AWS foundation:
  AWS+BAA, CDK, Postgres+Drizzle, Secrets Manager, observability, KMS,
  audit log + hash chain, webhook plumbing, worker service, consent
  versioning, test framework.
- **Identity Verification** (T-048–T-051) — Persona BAA + Inquiry flow +
  webhook + declined UX.
- **MDIntegrations** (T-052–T-065) — Phase 0 spike (event catalog + fixture
  library), token client, HTTP client, patient + case creation, webhook
  receiver, lifecycle/billing/messages handlers, subscription lifecycle,
  embedded URL helpers, dashboard, reconciler, 418 maintenance handling.
- **Pharmacy Fulfillment** (T-066–T-068) — partner BAA + passthrough
  validation + deferred direct-integration placeholder.
- **Hardening & LegitScript Prep** (T-069–T-075) — Stripe↔MDI
  reconciliation, audit-chain verifier, dashboards, admin audit timeline,
  LegitScript submission package, pen test, retention/deletion policy.

### Existing tickets rewritten (plan-grade detail added)
- **Auth** — T-013 (Clerk → better-auth), T-014 (MFA enrollment),
  T-015 (middleware + journey gates), T-016 (KMS-encrypted PII).
- **Intake** — T-017 (relocated to infrastructure + TDD invariant suite),
  T-018 (reframed as onboarding orchestration), T-020 (state-availability
  + test contract), T-021 (narrowed — deep clinical Qs move to MDI),
  T-022 (minimal intake UI).
- **Payments** — T-023 (BAA-aware metadata policy), T-024 (SetupIntent
  not charge), T-025 (per-condition + activate on case_completed),
  T-026 (idempotent webhook receiver), T-027 (cross-system cancel + dunning).
- **Deploy** — T-035 (BAA-aware analytics), T-036 (Route 53 + CloudFront +
  ACM), T-037 (App Runner + CDK + worker).
- **Launch blockers** — T-028 (expanded attorney review scope),
  T-032 (blocked by T-066 pharmacy partner selection).

## Recommended execution order

Per the architecture plan's phasing (the storybloq phase *display* order
doesn't match this — see *Known artifact*):

1. design-system (existing, in progress)
2. **infrastructure** (T-038–T-047, T-017) — foundation everything else needs
3. **auth** (T-013–T-016) — better-auth + middleware + profiles
4. **payments** (T-023–T-027) — Stripe primitives in test mode
5. **kyc** (T-048–T-051) — Persona, gated on BAA
6. **mdi-integration** (T-052–T-065) — start with the **T-052 Phase 0
   spike**, deliverable is the event catalog + fixture library
7. **intake-flow** (T-018–T-022) — orchestration ties prior phases together
8. **pharmacy** (T-066–T-067) — passthrough validation
9. **launch-blockers** (T-028–T-033)
10. **hardening** (T-069–T-075) — reconcilers + LegitScript package
11. **deploy** (T-034–T-037) — AWS App Runner + CDK production

## Known artifact: phase display order

The storybloq phase list shows the new phases in `after`-chain order, not
architecture-execution order — see L-001. The display reads:
Infrastructure → Auth → Intake → **Pharmacy** → Payments → KYC → MDI →
Launch → Hardening → Deploy. The architecture plan's execution order is
Payments → KYC → MDI → Intake → Pharmacy. Execution order is the source
of truth; the display order is cosmetic and does not constrain when
tickets are worked. If a phase reorder tool ships in storybloq later,
this can be fixed cosmetically.

## Lessons captured

- **L-001** Storybloq has no phase reorder — sequence inserts on first pass.
- **L-002** Codify "no PHI in Stripe" as policy + lint, not just convention.
- **L-003** Mirror integrations; never make local state the source of truth.

## BAA / external dependencies tracked

These block their respective phases. Recommend opening a `docs/compliance/baa-register.md` to track:

- **AWS BAA** → blocks all of infrastructure (T-038).
- **Datadog BAA** → blocks observability (T-042).
- **Persona BAA** → blocks KYC phase (T-048).
- **MDIntegrations BAA** → blocks MDI phase (referenced in T-052 onwards).
- **Pharmacy partner BAA** → blocks pharmacy phase (T-066) and T-032.
- **Stripe** — NOT BAA-eligible. Codified as architectural constraint
  (T-023, L-002).

## Next recommended actions

- T-052 (Phase 0 spike) is the single highest-leverage early ticket. The
  event-catalog + fixture-library deliverable cuts the biggest unknown
  in the MDI phase and unblocks integration testing for everything
  downstream.
- T-038 (AWS account + BAA) is on the critical path for infrastructure —
  kick off the AWS BAA paperwork now since it can run in parallel with
  design-system work.
- T-048 (Persona BAA) — same logic; vendor BAAs take wall-clock time.
