# Development Rules — Apoth

## Compliance (non-negotiable)

- This is a LegitScript-track telehealth site. Apoth is a **technology
  platform, not a medical provider** — never write copy implying Apoth
  practices medicine or prescribes.
- Compounded medications carry an explicit "Not FDA-approved" badge and the
  qualifier distinguishing them from Ozempic/Wegovy/Mounjaro/Zepbound.
- `/privacy` and `/terms` keep the `LegalReviewBanner` until a healthcare
  attorney signs off (T-028).
- Any user-visible value awaiting real data uses the visible `TODO:` chip:
  `font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep`.
- Never commit real PHI, secrets, or credentials.
- MDI is the clinical system of record. Apoth must not persist questionnaire
  answers after submission to MDI unless a future architecture decision and
  legal review explicitly change that boundary.
- Apoth may store only minimal app linkage data by default: Cognito subject,
  MDI patient/case IDs, Stripe customer/subscription IDs, consent version and
  timestamp, onboarding status, billing status, and webhook idempotency records.
- Stripe metadata must contain only opaque non-PHI identifiers. No condition,
  medication, diagnosis, symptom, questionnaire answer, clinician note, or
  patient health context goes to Stripe. See `docs/stripe-data-policy.md`.
- Persona/KYC is out of launch scope. Do not add identity-verification flows or
  KYC storage without a new product/compliance decision.

## Design System (see DESIGN.md)

- **Committed Clay**: warm clay carries 30–60% of any screen.
- **Two-Voice**: clay leads, sage supports — never equal weight.
- **No Clinical Blue**: no blue anywhere.
- **Serif-Lead**: display/headline is always serif; sans never headlines.
- **Patient Floor**: body type >=16px, target 17-18px on reading surfaces.
- **Flat-By-Default**: shadows only on state (hover/focus), never at rest.
- No em dashes or double-hyphens in body copy; no gradient text; no
  side-stripe borders.

## Code & Data

- App Router conventions; light/dark `Nav` variant by background.
- Long-form legal pages use the local `Section` helper pattern.
- Per-branch feature docs in `docs/features/<branch>.md` for non-trivial work.
- For ticket work, use Storybloq for ticket state, lessons, issues, and
  handovers, but implement directly by default. Run full multi-lens review only
  when the ticket or diff touches auth, payments, PHI/privacy/compliance,
  Stripe/MDI webhooks or intake, DynamoDB schema/idempotency/concurrency,
  infrastructure, secrets, or deployment security. For low-risk UI, docs,
  copy, and narrow refactors, use direct self-review plus tests; after a lens
  revise, re-run only the risk categories touched by fixes.
- Cognito owns patient authentication. Do not introduce Clerk, Supabase Auth,
  better-auth, or a Postgres-backed auth system without a new architecture
  decision.
- DynamoDB is the launch app-data store. Do not introduce RDS/Postgres,
  Drizzle migrations, Redis, App Runner, ECS workers, NAT gateways, or VPC
  endpoints for launch work unless the reset architecture is reopened.
- Serverless webhook handling should prefer Lambda plus DynamoDB idempotency,
  with SQS/DLQ only where retry durability is required.
- Logs, analytics, Sentry, and support tooling must treat PHI as out of scope
  unless the vendor has an active BAA/compliance approval and redaction is in
  place.

## Testing

- TDD for business logic: write tests first for clinical eligibility
  screening, residency/state capture validation, and payment-gating logic. These
  define the contract before implementation — the "no card charged before
  clinical confirmation" promise must be test-enforced.
- Add tests around MDI/Stripe webhook signature verification and idempotency
  before wiring production webhook side effects.
