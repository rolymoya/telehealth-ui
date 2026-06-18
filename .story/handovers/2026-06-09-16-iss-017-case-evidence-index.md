# ISS-017 Handover: Case-Scoped Evidence Timeline Access

## Completed

- Resolved ISS-017 with commit `1a352a4` (`feat: add case-scoped evidence index (ISS-017)`).
- Added `EvidenceCaseIndexRecord` under `MDI#CASE#{mdiCaseId}` / `EVIDENCE#{occurredAt}#{eventId}`.
- Added `evidenceCaseIndexKey`, `createEvidenceCaseIndexRecord`, and a shared `createEvidenceEventWriteOperations` helper so pure and production DynamoDB evidence writers use the same transactional write list.
- Updated both `recordEvidenceEvent` and `recordEvidenceEventDynamoDb` to write the case pointer in the same transaction when an event has `mdiCaseId`.
- Preserved webhook replay behavior by resolving duplicate webhook conflicts through the uniqueness record, including conflicts caused by the new case pointer.
- Replaced `listEvidenceEventsForMdiCase` patient-page filtering with a direct case-index query plus dereference validation.
- Added validation for forged cursors, malformed case pointers, dangling pointers, wrong case/subject targets, and non-evidence targets.
- Updated DynamoDB/data classification/runbook docs to classify the case index as restricted pointer metadata and document the direct case access pattern.
- Marked `.story/issues/ISS-017.json` resolved with `resolvedDate: 2026-06-10`.

## Verification

- `npm test -- app-data.test.ts` passed: 42 tests.
- `npm test` passed: 19 files, 218 tests.
- `npm run typecheck` passed.
- `git diff --check` passed.
- `storybloq_validate` passed with 0 errors and 6 pre-existing warnings for open issues without related tickets.
- `npm run lint` did not run because the existing script invokes `next lint`, which fails in this Next.js setup with: `Invalid project directory provided, no such directory: /Users/roly/git/telehealth-ui/lint`.

## Review Notes

- L-004 risk posture was applied because this touched DynamoDB and PHI-adjacent pointer metadata.
- Local review found no blocking findings after tests/typecheck; Storybloq review synthesis received no findings. The review snapshot tool flagged integrity because a compact payload was used after local full-diff review, so do not treat that as an independent multi-agent review transcript.

## Left Alone

- T-011 remains modified and unstaged from unrelated work.
- Existing untracked `.story/handovers/*` files remain untracked.
- Avoided T-011, T-012, and T-084 per user direction.

## Suggested Next Step

Continue autonomous work on a non-UI backend/security/serverless issue or ticket. Re-run Storybloq recommendation and avoid UI-heavy items plus T-011, T-012, and T-084.