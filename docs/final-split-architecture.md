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

Patient routes are owned by the Vite app:

- `/checkout`
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
- `/onboarding/mdi`
- `/dashboard`
- `/billing`
- `/account`
- `/medication-management`
- `/portal/launch`

API routes are owned by API Gateway/Lambda:

- `/api/auth/session`
- `/api/intake/bootstrap`
- `/api/intake/privacy-notice`
- `/api/intake/precheck`
- `/api/onboarding/start`
- `/api/onboarding/consent`
- `/api/onboarding/mdi/bootstrap`
- `/api/onboarding/mdi/patient`
- `/api/onboarding/mdi/submit`
- `/api/dashboard`
- `/api/dashboard/workflows/{workflow}`
- `/api/billing/payment-method`
- `/api/billing/subscription/cancel`
- `/api/webhooks/stripe`
- `/api/webhooks/mdi`

`src/app/api` is quarantined as a temporary local-development compatibility
layer. Production changes belong in Lambda handlers and CDK routes.

## Runtime Boundaries

The Vite patient app is a static shell. It must not embed patient-specific data
in HTML. Auth, consent gates, billing state, dashboard state, MDI linkage, and
workflow redirects come from `/api/*` calls.

MD Integrations remains the clinical system of record. Apoth can store minimal
linkage and operational evidence, but must not persist questionnaire answers
after submission to MDI.

Staging can run the MDI intake Lambdas with `APOTH_MDI_MODE=synthetic` while
MDI sandbox credentials are unavailable. Synthetic mode returns deterministic
opaque MDI patient, case, and submission IDs plus a small synthetic
questionnaire fixture. It never sends patient details or questionnaire answers
to MDI, and it still persists only the normal linkage/status records. Production
must use `APOTH_MDI_MODE=live`; CDK config and the Lambda runtime both fail
closed if synthetic mode is configured for production.

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
- checkout, account, and portal handoff at `http://127.0.0.1:5173`

Marketing CTAs use the account origin instead of resolving `/checkout` on the
marketing server. The Vite server calls relative `/api/*` routes and proxies
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
