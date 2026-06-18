# Apoth — Telehealth UI

## Purpose

Patient-facing telehealth surface for Apoth. It converts curiosity into a
started intake, then gives patients a lightweight account area for onboarding,
case status, billing, and MDI-backed care workflow access.

Apoth is a thin technology layer. It owns identity, commerce orchestration, the
intake UI, and minimal linkage records. MD Integrations is the clinical system
of record and receives the clinical questionnaire responses. Apoth should not
persist questionnaire answers after they are submitted to MDI.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3, PostCSS, autoprefixer
- Auth: Amazon Cognito
- App data: DynamoDB for minimal patient/profile/linkage records
- Clinical system of record: MD Integrations API
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
- Intake collects MDI-provided questions in Apoth UI, submits them to MDI, and
  does not retain the answers locally.
- Dashboard data should come from MDI APIs or MDI embedded workflow URLs where
  feasible. Local state is a cache/pointer layer, not the clinical source of
  truth.
- Webhook reliability should use Lambda/SQS/DLQ where needed; do not reintroduce
  always-on ECS workers, Redis, RDS, App Runner, NAT gateways, or VPC endpoints
  without a new architecture decision.
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

The launch posture is thin-PHI: avoid storing clinical content in Apoth. Vendors
that receive, maintain, or transmit PHI need a valid compliance/BAA path. Stripe
is not BAA-eligible, so Stripe metadata must contain only opaque non-PHI IDs.
Persona/KYC is out of launch scope unless a future medication, pharmacy, or
partner requirement reintroduces it.

## Testing

Tests run after building (Tests-only recipe). Write tests for residency/state
capture validation, clinical eligibility, MDI/Stripe webhook verification, and
the payment timing invariant — see RULES.md.

## Roadmap

Roadmap is being reset around Cognito, DynamoDB, MDI-backed intake/dashboard,
Stripe, and lean AWS serverless deployment. The previous infra-heavy plan
(better-auth, RDS, Redis, App Runner, ECS workers, Persona, Datadog) is
superseded. See `docs/architecture-reset-audit.md`.
