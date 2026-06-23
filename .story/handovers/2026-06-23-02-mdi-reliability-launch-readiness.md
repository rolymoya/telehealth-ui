# MDI Reliability + Launch Readiness Slice

## Completed

- Completed T-065 MDI maintenance/unavailable handling.
  - Added typed propagation of MDI 418/transient retry hints from `Retry-After` / `retryAfterSeconds`.
  - Persisted bounded retry evidence on MDI patient/case creation attempts without clinical content.
  - Added patient-safe onboarding/dashboard unavailable copy.
  - Added focused tests proving retry-safe idempotency behavior and no raw MDI payloads, workflow URLs/tokens, or questionnaire answers in evidence/log-adjacent records.

- Completed T-104 scheduled MDI reconciler runtime evidence.
  - Verified T-064 code was already implemented locally and repaired stale Story state by marking T-064 complete.
  - Added Lambda handler tests for bounded pagination, cursor persistence, timeout/retry-safe provider-unavailable behavior, and PHI-safe aggregate logs.
  - Kept EventBridge retry/alarm/runbook evidence validated through existing infra stack tests.

- Completed T-034 SEO and metadata assets.
  - Added `robots.ts`, `sitemap.ts`, generated app icon, generated OG image, and conservative metadata.
  - Public sitemap only includes static public pages; authenticated/intake/API surfaces are disallowed from robots.

## Tests

- `npm test -- src/lib/mdi/__tests__/client.test.ts src/lib/__tests__/mdi-patient.test.ts src/lib/__tests__/mdi-intake.test.ts src/lib/__tests__/mdi-workflows.test.ts src/app/__tests__/mdi-intake-page.test.tsx` passed: 49 tests.
- `npm test -- src/lib/__tests__/mdi-case-reconciliation.test.ts src/lib/__tests__/mdi-case-reconciliation-lambda.test.ts` passed: 6 tests.
- `npm test --prefix infra -- serverless-platform-stack.test.ts` passed: 30 tests.
- Combined focused app suite including metadata passed: 57 tests.
- `npm run typecheck` passed.
- `npm test` passed: 53 files, 506 tests, with existing jsdom navigation warnings.
- `npm test --prefix infra` still fails only in `infra/test/mdi-intake-lambda.test.ts` because the Lambda submit handler/test contract is stale relative to shared `submitMdiIntake` and returns `invalid_input` before provider calls.

## Story State

- T-064 marked complete after local implementation/runtime evidence was verified.
- T-065 marked complete.
- T-104 marked complete.
- T-034 marked complete.
- Created T-105: Repair MDI intake Lambda submit contract drift.

## Follow-Up

- T-105 should decide the approved submit Lambda contract, update `infra/src/lambda/mdi-intake.ts` and infra tests, and preserve thin-PHI boundaries.
- The worktree already contained unrelated dirty billing/dashboard/T-101/T-102 changes before this session; they were left untouched.