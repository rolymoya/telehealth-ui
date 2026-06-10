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

By default, Playwright starts or reuses the local Next.js dev server at
`http://127.0.0.1:3000`. Set `PLAYWRIGHT_BASE_URL` to run the same tests against
an already-running app or a deployed staging URL.

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

## Conventions

- Place specs under `tests/e2e` and name smoke specs with a clear `@smoke` tag.
- Use accessible locators such as roles, labels, and visible patient-facing
  text before test IDs.
- Keep fixtures deterministic and minimal. Opaque identifiers are acceptable;
  clinical content is not.
- Failed runs retain traces and full-page screenshots. CI also writes JUnit,
  HTML, and blob reports for artifact upload.
