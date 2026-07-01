# Final Split Architecture

Apoth now uses three production route owners behind one CloudFront distribution:

- Marketing/legal static site: Next static export in `out/`, served from the
  static assets bucket.
- Patient app: Vite React SPA in `dist/patient-app/`, served from the patient
  app bucket.
- Runtime APIs: API Gateway HTTP API backed by Lambda handlers under
  `infra/src/lambda`.

## Route Ownership

Marketing/legal routes remain static-first:

- `/`
- `/about`
- `/privacy`
- `/terms`

Patient routes are owned by the Vite app:

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

Run the marketing/API server:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Run the patient app:

```sh
VITE_PATIENT_API_PROXY_TARGET=http://127.0.0.1:3000 npm run patient:dev -- --host 127.0.0.1
```

The Vite dev server calls relative `/api/*` routes and proxies them to the
local Next compatibility API.

## Deployment

The static UI workflow builds and syncs two artifacts:

- `npm run build:static` -> `out/` -> marketing static bucket
- `npm run patient:build` -> `dist/patient-app/` -> patient app bucket

CloudFront routes `/api/*` to API Gateway, patient paths and
`/patient-assets/*` to the patient app bucket, and marketing/legal paths to the
marketing static bucket. Patient SPA routes rewrite to `patient-index.html`
instead of `index.html` so CloudFront cache entries cannot collide with the
marketing homepage.

The deploy workflow snapshots the current marketing and patient S3 buckets
before upload. After sync and CloudFront invalidation, it runs route smoke tests
and deploy-safe Playwright coverage against the deployed CloudFront URL:
public/static routes plus patient auth and route-guard shells. The deeper
intake, dashboard, and billing E2E specs remain local contract tests because
they install mocked API guards that intentionally block non-local document
navigation. If deployed verification fails, the workflow restores both buckets
from the pre-deploy snapshot and invalidates CloudFront again.
