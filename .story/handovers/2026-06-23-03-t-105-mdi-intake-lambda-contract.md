# T-105 MDI Intake Lambda Contract Drift

## Completed

- Repaired the infra MDI intake submit Lambda to match the shared `submitMdiIntake` contract.
- Replaced the legacy `submitResponses` gateway path with the current `createCase` handoff path using the partner `/partner/cases` endpoint.
- Submit payload now uses transient `casePayload` plus `questionnaireId` and `responses`; browser-submitted MDI `patientId`/`caseId` are no longer accepted as submit linkage authority.
- The Lambda injects the server-side MDI patient pointer into the MDI case payload as `patient_id`.
- Added DynamoDB-backed case-create attempt handling with deterministic `mdi-case-*` idempotency keys, bounded claim leases, retryable/terminal failure states, and submitted pointer persistence.
- Preserved thin-PHI posture: clinical answers/case-question content are sent transiently to MDI only and are not stored in DynamoDB claim/submitted records or route responses.
- Updated the onboarding MDI client to build transient case-question payloads from rendered questions/responses and keep MDI linkage server-owned.

## Verification

- `npm test --prefix infra -- mdi-intake-lambda.test.ts` passed: 8 tests.
- `npm test -- src/app/__tests__/mdi-intake-page.test.tsx src/lib/__tests__/mdi-intake.test.ts` passed: 16 tests.
- `npm run typecheck` passed.
- `npm test --prefix infra` passed: 7 files, 75 tests.
- `npm test` passed: 53 files, 506 tests. Existing jsdom navigation warnings appeared.
- `git diff --check` passed.

## Story State

- T-105 marked complete.

## Notes

- The worktree still contains unrelated pre-existing billing/dashboard/T-101/T-102 changes and the previous MDI reliability/SEO slice changes. This session only added the T-105 contract repair on top of that dirty worktree.