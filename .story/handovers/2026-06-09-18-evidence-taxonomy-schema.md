# Evidence Taxonomy Handover: ISS-014 and ISS-016

## Completed

- Resolved ISS-014 with commit `31b8fad` (`refactor: centralize evidence event taxonomy (ISS-014)`).
- Resolved ISS-016 with commit `6f34d70` (`refactor: declare evidence linkage in schema (ISS-016)`).

## ISS-014 Details

- Replaced parallel evidence taxonomy structures with one `evidenceEventSchema` in `src/lib/dynamodb/app-data.ts`.
- `EvidenceEventType` is now derived from `keyof typeof evidenceEventSchema`.
- Validation now reads category, summary code, allowed statuses, metadata keys, and metadata values from that schema.
- Removed the separate event type set, category map, summary-code map, status map, metadata-key map, and metadata-value map.

## ISS-016 Details

- Added per-event linkage requirements to `evidenceEventSchema`.
- Replaced the event-type linkage switch with schema-based validation.
- Kept event-ID shape validation separate because it depends on event fields and opaque ID formats rather than simple taxonomy declarations.

## Verification

For the taxonomy session:

- `npm test -- app-data.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed: 19 files, 218 tests.
- `git diff --check` passed.

## Known Non-Blocking Environment Notes

- `npm run lint` remains blocked by the existing `next lint` script behavior in this Next.js setup.
- Commits continue to emit a pre-existing git GC warning about unreachable loose objects and `.git/gc.log`.

## Left Alone

- T-011 remains modified and unstaged from unrelated work.
- Existing untracked `.story/handovers/*` files remain untracked.
- T-011, T-012, and T-084 were avoided per user direction.

## Suggested Next Step

Pick another backend/serverless/testability issue that does not require real credentials, owner-provided production values, UI churn, or external partner decisions. Good candidates may include npm audit issues if they can be reproduced and fixed safely, but avoid ISS-002/T-052/T-066/T-029/T-033 without owner input.