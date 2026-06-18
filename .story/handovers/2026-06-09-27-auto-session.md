# ISS-015 Handover: Evidence Schema Extraction

## Completed

- Resolved ISS-015 with commit `7eea1ea` (`refactor: split evidence schema definitions (ISS-015)`).
- Added `src/lib/dynamodb/evidence-schema.ts` for evidence-specific event categories, actor/status types, linkage requirements, metadata types, and the centralized `evidenceEventSchema`.
- Updated `src/lib/dynamodb/app-data.ts` to import the schema for validation while re-exporting the existing public evidence types from the original module.
- Kept record shapes, repository behavior, event ID validation, linkage validation, and DynamoDB helpers in `app-data.ts`; this was a narrow definitions/schema extraction, not a broad repository split.
- Marked `.story/issues/ISS-015.json` resolved with `resolvedDate: 2026-06-10`.

## Verification

- `npm test -- app-data.test.ts` passed: 42 tests.
- `npm run typecheck` passed.
- `npm test` passed: 19 files, 218 tests.
- `APOTH_STAGE=staging npm run build` passed.
- `git diff --check` passed.
- `storybloq_validate` passed with 0 errors and 2 unrelated existing warnings.

## Notes

- Public type compatibility is preserved through re-exports from `app-data.ts`.
- Commit emitted the existing git GC warning about `.git/gc.log` and unreachable loose objects.

## Left Alone

- T-011 remains modified and unstaged from unrelated work.
- Existing untracked `.story/handovers/*` files remain untracked.
- T-011, T-012, and T-084 were avoided per user direction.

## Suggested Next Step

Only ISS-002, ISS-009, and ISS-013 remain open. ISS-002 needs real AWS/BAA source values. ISS-009 and ISS-013 concern unrelated dirty working-tree state, including the pre-existing T-011 edit and untracked handovers. Those should not be resolved by guessing or reverting user/session state.