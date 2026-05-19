# Handover — storybloq Project Setup

## Session summary

Initialized the storybloq roadmap for **telehealth-ui (Apoth)**, an existing
Next.js 16 marketing site. Analyzed the codebase, PRODUCT.md, DESIGN.md, and
the `improve-LegitScript-compliance` feature doc, then created 8 phases and
36 tickets. Ran an independent review of the proposal before creating anything.

## Setup decisions

- **Surface**: Web app — marketing site for a patient-facing telehealth service.
- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind 3 (existing).
- **System shape**: static-first today; auth + intake + payments phases will
  introduce server-side logic.
- **Sensitive domain**: yes — healthcare, LegitScript certification track.
- **Auth (planned)**: Clerk recommended; confirm vs Supabase/Firebase in T-013.
- **Payments (planned)**: Stripe.
- **Quality checks**: Tests-only recipe (`TEST` stage, `npm test`). A test
  framework setup ticket (T-017, Vitest + RTL) precedes the eligibility logic.
- **Design source**: existing DESIGN.md (tokens still placeholder — resolved in T-010).

## Phases (order)

foundation ✓ → compliance ✓ → design-system → auth → intake-flow → payments →
launch-blockers → deploy. `launch-blockers` was deliberately deprioritized to
near the bottom (mostly waiting on legal/corporate input).

- **foundation** (complete): T-002–T-004 — scaffold, design tokens, marketing components.
- **compliance** (complete): T-005–T-009 — compliance routes, HIPAA privacy +
  NPP, terms, FDA disclosures, Apoth rebrand. Reflects merged PR #1.
- **design-system**: T-010–T-012 — resolve DESIGN.md tokens, component docs, a11y audit.
- **auth**: T-013–T-016 — auth provider, sign-in UI, sessions, patient account.
- **intake-flow**: T-017–T-022 — test framework, intake design, error routes,
  state-availability, clinical eligibility screening, intake form UI.
- **payments**: T-023–T-027 — Stripe setup, checkout, subscriptions, webhooks, refunds.
- **launch-blockers**: T-028–T-033 — attorney review, contact info, address,
  NPI, pharmacy partner disclosure, tiered pricing.
- **deploy**: T-034–T-037 — SEO assets, analytics/consent, domain/HTTPS, deploy.

Note: storybloq ticket IDs are offset +1 from the planning table used during
the interview (the table's T-001 = actual T-002, etc.).

## Independent review findings (incorporated)

The proposal was audited by an independent reviewer. Changes made:
- Split state-availability vs clinical eligibility into separate tickets.
- Added a `design-system` phase, moved *before* intake-flow (intake UI and the
  a11y audit both depend on finalized tokens; layout.tsx already hardcodes fonts).
- Added tickets for error/404/loading routes, SEO/metadata assets (public/ is
  empty), and analytics/cookie consent (privacy policy documents cookies but
  nothing implements consent).
- Scoped T-028 (attorney review) to explicitly enumerate NPP, telehealth
  disclosure, refunds matrix, and arbitration clause; acceptance = remove
  `LegalReviewBanner`.

## Files created

- `CLAUDE.md` (1,821 chars) — project spec.
- `RULES.md` (1,726 chars) — compliance, design-system, and TDD rules.
- `.gitignore` — added storybloq session-local entries.

## Next steps

First recommended ticket: **T-010 — Resolve DESIGN.md tokens (OKLCH palette,
font selection)**. It unblocks component docs, the a11y audit, the auth UI, and
the intake form UI. Open launch blockers from the feature doc are tracked as
T-028–T-033.
