# ISS-011 Handover: Dashboard Metric Wiring Assertions

## Completed

- Resolved ISS-011 with commit `516547b` (`test: assert dashboard metric wiring (ISS-011)`).
- Replaced dashboard substring assertions in `infra/test/serverless-platform-stack.test.ts` with structured parsing of the synthesized CloudWatch `DashboardBody`.
- Added helpers that normalize `Fn::Join` CloudFormation tokens, parse the dashboard JSON, map metrics by widget title, and construct expected custom metric rows from the existing observability contracts.
- The launch observability dashboard test now verifies:
  - the exact seven expected widget titles,
  - AWS metric namespaces, metric names, dimensions, dimension values, and stats,
  - Apoth custom metric namespace, metric names, all configured dimensions, dimension values, and stats.
- Marked `.story/issues/ISS-011.json` resolved with `resolvedDate: 2026-06-10`.

## Verification

- `npm --prefix infra test -- serverless-platform-stack.test.ts` passed: 22 tests.
- `npm --prefix infra run build` passed.
- `npm --prefix infra test` passed: 2 files, 29 tests.
- `git diff --check` passed.
- `storybloq_validate` passed with 0 errors and 3 unrelated existing warnings.

## Notes

- No production infrastructure code changed; this was a test-quality fix.
- `npm` printed a new-major-version notice during infra commands; no npm upgrade was performed.
- Commit emitted the existing git GC warning about `.git/gc.log` and unreachable loose objects.

## Left Alone

- T-011 remains modified and unstaged from unrelated work.
- Existing untracked `.story/handovers/*` files remain untracked.
- T-011, T-012, and T-084 were avoided per user direction.

## Suggested Next Step

Remaining open issues are mostly not good autonomous backend/security candidates: ISS-002 requires real AWS/BAA source values; ISS-009 and ISS-013 concern unrelated dirty working-tree state; ISS-015 is a broader evidence-module extraction that should be planned deliberately if pursued.