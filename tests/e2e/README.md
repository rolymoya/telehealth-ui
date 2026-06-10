# Playwright E2E Tests

This directory contains browser-level tests for the patient-facing Apoth app.
The default suite must run without live AWS, Cognito, MDI, or Stripe
credentials.

## Commands

- `npm run test:e2e`: run the Playwright suite headlessly.
- `npm run test:e2e:smoke`: run the narrow smoke path tagged `@smoke`.
- `npm run test:e2e:ui`: open Playwright's interactive UI runner.
- `npm run test:e2e:report`: open the last HTML report.
- `npx playwright install`: install browser binaries on a new machine or CI
  image before the first run.

By default, Playwright starts the local Next.js dev server at
`http://127.0.0.1:3000`. Set `PLAYWRIGHT_BASE_URL` to run the same tests against
an already-running app or a deployed staging URL.

Local E2E starts its own server by default so the process has the expected test
environment. Set `PLAYWRIGHT_REUSE_SERVER=1` only when the existing local server
was started with the same E2E environment.

## Fixture Safety

Committed fixtures must be synthetic and non-PHI. Do not commit:

- real patient data, names, dates of birth, phone numbers, or addresses;
- clinical questionnaire answers, symptoms, diagnoses, medications, clinician
  notes, or chart content;
- secrets, tokens, passwords, API keys, webhook signing secrets, or live vendor
  payloads;
- Stripe metadata containing anything except opaque non-PHI identifiers.

MDI, Stripe, Cognito, and AWS behavior should be mocked by default in local and
CI E2E runs. Staging smoke tests may use approved synthetic accounts and
secret-store configuration, but credentials must never be stored in this
directory.

## Local Auth Seam

Protected-route E2E specs use a local-only auth seam. The Playwright web server
sets `APOTH_E2E_AUTH_ENABLED=1` and a per-run opaque `APOTH_E2E_AUTH_TOKEN`, and
authenticated specs send that value as `x-apoth-e2e-auth`. Set
`APOTH_E2E_AUTH_TOKEN` only when the target environment has been explicitly
configured for that same synthetic test token.

This token is not a credential and must not be reused for staging or production.
The app ignores the seam unless it is explicitly enabled, a token is configured,
the header matches exactly, and `NODE_ENV` is not `production`. The seam renders
protected shells for synthetic browser tests only; it does not mint session
cookies, call Cognito, call DynamoDB, or store patient data.

## Conventions

- Place specs under `tests/e2e` and name smoke specs with a clear `@smoke` tag.
- Use accessible locators such as roles, labels, and visible patient-facing
  text before test IDs.
- Keep fixtures deterministic and minimal. Opaque identifiers are acceptable;
  clinical content is not.
- Failed runs retain traces and full-page screenshots. CI also writes JUnit,
  HTML, and blob reports for artifact upload.
- Put shared helpers under `tests/e2e/support` and keep them generic enough for
  local, CI, and staging smoke profiles.
