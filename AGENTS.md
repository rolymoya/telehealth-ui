# Apoth — Telehealth UI

## Purpose

Patient-facing telehealth surface for Apoth. It converts curiosity into an
ecommerce-style setup Checkout that also creates a passwordless account, then
hands the verified patient into a white-label clinical intake and portal.

Apoth is a thin technology layer. It owns marketing, identity, commerce
orchestration, and minimal linkage records. The selected white-label portal
owns intake and the clinical record. Apoth must not render or persist clinical
questionnaire answers. MD Integrations remains a legacy adapter during
migration, not the target patient experience.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3, PostCSS, autoprefixer
- Auth: Amazon Cognito
- App data: DynamoDB for minimal patient/profile/linkage records
- Clinical system of record: selected white-label portal (provider adapter TBD;
  MD Integrations remains the legacy migration adapter)
- Payments: Stripe
- Testing: Vitest + React Testing Library (planned)
- Deploy target: AWS serverless stack, likely Amplify Hosting or S3/CloudFront
  for the frontend plus API Gateway/Lambda for backend APIs

## Architecture

- App Router under `src/app`; shared components in `src/components`;
  static content in `src/lib/data.ts`.
- Public marketing/legal pages stay static-first.
- Authenticated product surfaces use Cognito for accounts and DynamoDB for
  minimal app records: `cognito_sub`, `mdi_patient_id`, `mdi_case_id`,
  `stripe_customer_id`, consent/version timestamps, onboarding and billing
  status.
- Apoth does not collect clinical questionnaire answers. It provisions an
  opaque patient/case linkage and creates an authenticated, single-use launch
  into the selected portal.
- Clinical status and workflow data should come from signed provider events or
  short-lived provider launches. Local state is a pointer/status layer, not the
  clinical source of truth.
- Webhook reliability should use Lambda/SQS/DLQ where needed; do not reintroduce
  always-on ECS workers, Redis, RDS, App Runner, NAT gateways, or VPC endpoints
  without a new architecture decision.
- Marketing routes: `/`, `/weight-loss`, `/about`, `/privacy`, `/terms`.
  Commerce/account routes: `/checkout`, `/checkout/complete`, `/verify`, and
  `/portal/launch`. Legacy intake routes redirect to Checkout or the portal.

## Corporate Structure

- **Apoth Health LLC** (Illinois) — the technology platform. Not a medical
  provider.
- **MD Integrations** — independent third-party physician group.
- **503A compounding pharmacy partner** — separate licensed entity (name TBD).

## Domain

Sensitive / regulated (healthcare). Targeting LegitScript certification.
Requires HIPAA-aware privacy handling, FDA-status disclosures on compounded
medications, and audit-conscious data practices.

The launch posture is thin-PHI: avoid storing clinical content in Apoth. Vendors
that receive, maintain, or transmit PHI need a valid compliance/BAA path. Stripe
is not BAA-eligible, so Stripe metadata must contain only opaque non-PHI IDs.
Persona/KYC is out of launch scope unless a future medication, pharmacy, or
partner requirement reintroduces it.

## Testing

Tests run after building (Tests-only recipe). Write tests for Stripe/provider
webhook verification, enrollment concurrency and idempotency, portal launch
authorization, and the payment timing invariant — see RULES.md.

## Roadmap

Roadmap is being reset around a separate static marketing site, hosted Stripe
Checkout as passwordless signup, Cognito, DynamoDB, a white-label clinical
portal, and lean AWS serverless deployment. See
`docs/features/checkout-as-signup-white-label-portal.md`.
