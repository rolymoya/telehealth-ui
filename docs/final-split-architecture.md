# Final Split Architecture

Apoth uses three production route owners behind one CloudFront distribution:

- Marketing/legal static site: Next static export in `out/`, served from the
  static assets bucket.
- Patient app: Vite React SPA in `dist/patient-app/`, served from the patient
  app bucket on patient-route cache behaviors.
- Runtime APIs: API Gateway HTTP API backed by Lambda handlers under
  `infra/src/lambda`, reached through the `/api/*` cache behavior.

## Route Ownership

Marketing/legal routes remain static-first:

- `/`
- `/about`
- `/privacy`
- `/terms`
- `/weight-loss`

Patient routes are owned by the Vite app:

- `/checkout` (legacy redirect to staged enrollment)
- `/checkout/complete`
- `/verify`
- `/get-started`
- `/intake`
- `/sign-in`
- `/sign-up`
- `/verify-email`
- `/reset-password`
- `/sign-out`
- `/onboarding/consent`
- `/onboarding/mdi` (legacy redirect to `/portal/launch`)
- `/dashboard`
- `/billing`
- `/account`
- `/medication-management`
- `/portal/launch`

API routes are owned by API Gateway/Lambda:

- `/api/auth/session`
- `/api/auth/email-otp/start`
- `/api/auth/email-otp/confirm`
- `/api/intake/bootstrap`
- `/api/intake/privacy-notice`
- `/api/intake/precheck`
- `/api/onboarding/start`
- `/api/onboarding/consent`
- `/api/portal/launch`
- `/api/onboarding/mdi/bootstrap`
- `/api/onboarding/mdi/patient`
- `/api/onboarding/mdi/submit`
- `/api/dashboard`
- `/api/dashboard/workflows/{workflow}`
- `/api/billing/payment-method`
- `/api/billing/offer`
- `/api/billing/subscription/cancel`
- `/api/webhooks/stripe`
- `/api/webhooks/mdi`

`src/app/api` is quarantined as a temporary local-development compatibility
layer. Production changes belong in Lambda handlers and CDK routes.

## Runtime Boundaries

The Vite patient app is a static shell. It must not embed patient-specific data
in HTML. Auth, consent gates, billing state, dashboard state, opaque provider
linkage, and workflow redirects come from `/api/*` calls.

The selected white-label provider portal is the clinical system of record and
collects the clinical questionnaire. Apoth can store minimal linkage and
operational evidence, but must not render or persist questionnaire answers.
MD Integrations remains a migration adapter; its API routes are not the target
patient experience.

Staging may retain synthetic MDI behavior only for migration-adapter testing.
The target portal launch uses opaque patient/case provisioning and a short-lived
launch URL. Production portal provisioning and launch flags stay disabled until
the selected provider has an approved security and BAA path; the runtime fails
closed when that contract is incomplete.

Stripe receives only opaque, non-PHI identifiers in metadata. Do not send
condition, medication, diagnosis, symptom, answer, note, or clinical context to
Stripe.

## Local Development

Run both local origins with one command:

```sh
npm run dev
```

This starts:

- marketing and local compatibility APIs at `http://127.0.0.1:3000`
- staged enrollment, account, billing, and portal handoff at `http://127.0.0.1:5173`

Marketing CTAs use the account origin and enter at `/get-started`, not hosted
checkout. The Vite server calls relative `/api/*` routes and proxies
them to the local Next compatibility API. `npm run dev:marketing` and
`npm run patient:dev` remain available for isolated debugging.

The local shell does not invent Stripe credentials, signing material, or a
DynamoDB checkout store. Without the staging checkout flags and approved test
secret sources, the checkout page stays usable for UI review but reports that
Stripe test-mode configuration is required. Use `npm test` for the mocked
checkout contract, or configure the values in the checkout staging runbook to
open real Stripe-hosted test Checkout. Never commit secret payloads or put a
Stripe secret key in a public Vite/Next variable.

## Deployment

The static UI workflow builds and syncs two artifacts:

- `npm run build:static` -> `out/` -> marketing static bucket
- `npm run patient:build` -> `dist/patient-app/` -> patient app bucket

The distribution routes `/api/*` to API Gateway, patient routes to the patient
app bucket, and public marketing routes to the static export bucket. Production
attaches `apothhealth.com` and `www.apothhealth.com` to this distribution with
an ACM certificate supplied at deploy time. The publish workflow injects the
stack's `PublicSiteOrigin` into both artifacts so marketing, account, and API
navigation stay on one origin.

The deploy workflow snapshots the current marketing and patient S3 buckets
before upload. After sync and one CloudFront invalidation, it runs route smoke
tests and deploy-safe Playwright coverage against the deployed public origin:
public/static routes plus patient auth and route-guard shells. The deeper
intake, dashboard, and billing E2E specs remain local contract tests because
they install mocked API guards that intentionally block non-local document
navigation. If deployed verification fails, the workflow restores both buckets
from the pre-deploy snapshot and invalidates CloudFront again.
