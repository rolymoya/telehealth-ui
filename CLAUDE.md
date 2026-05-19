# Apoth — Telehealth UI

## Purpose

Marketing surface for Apoth, a patient-facing telehealth service. It converts
curiosity into a booked visit and sets expectations for the in-product
experience. Future scope adds patient auth, a clinical intake flow, and Stripe
billing — the site is moving from a static marketing surface to a small
full-stack app.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3, PostCSS, autoprefixer
- Auth: Clerk (planned — confirm vs Supabase/Firebase before building)
- Payments: Stripe (planned)
- Testing: Vitest + React Testing Library (planned)
- Deploy target: Vercel (recommended)

## Architecture

- App Router under `src/app`; shared components in `src/components`;
  static content in `src/lib/data.ts`.
- Static-first today. Auth, intake eligibility, and payments will introduce
  server-side logic (route handlers / server actions).
- Routes: `/` (marketing), `/about`, `/privacy`, `/terms`, `/get-started`
  (stub — to be replaced by the real intake flow).

## Corporate Structure

- **Apoth Health LLC** (Illinois) — the technology platform. Not a medical
  provider.
- **MD Integrations** — independent third-party physician group.
- **503A compounding pharmacy partner** — separate licensed entity (name TBD).

## Domain

Sensitive / regulated (healthcare). Targeting LegitScript certification.
Requires HIPAA-aware privacy handling, FDA-status disclosures on compounded
medications, and audit-conscious data practices.

## Testing

Tests run after building (Tests-only recipe). Write tests for clinical
eligibility logic — see RULES.md.

## Roadmap

8 phases tracked in storybloq: foundation ✓ → compliance ✓ → design-system →
auth → intake-flow → payments → launch-blockers → deploy. Run `/story` to load.
