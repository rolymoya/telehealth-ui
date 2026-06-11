# Autonomous Session Handover — Intake Flow Prereqs + MDI Intake

## Session
- Session ID: 658313d7-d19a-4749-aadc-90c6af7fc643
- Branch: codex/architecture-reset-audit
- Objective: keep L-004 in mind and complete the targeted intake-flow phase work after T-047 prerequisite completion.
- Completed tickets: T-052, T-053, T-054, T-022

## Completed Work
- T-052 committed as `77031b7feb26d95baa53dd3e6f2308bd19a44f7e`.
- T-053 committed as `bd2446b8ede99d453317e68c2aefd18906ccc3b2`.
- T-054 committed as `c12d9615be72fa19693b5b0978aa06af65e8f1f0`.
- T-022 committed as `99074059ce43052b9b485ca23436d235e66ec586`.

## T-022 Summary
- Added `/onboarding/mdi` clinical intake shell and client flow.
- Added pure MDI intake orchestration in `src/lib/mdi-intake.ts` with bootstrap/submit behavior, precheck status handling, server-owned linkage checks, submission claim/idempotency support, and pointer-only persistence boundaries.
- Added MDI intake Lambda handlers for bootstrap and submit, using cookie auth, consent checks, CSRF/origin protection, DynamoDB status/linkage reads, production MDI gateway calls, Secrets Manager access, and stable idempotency-key propagation.
- Wired CDK routes:
  - `GET /api/onboarding/mdi/bootstrap`
  - `POST /api/onboarding/mdi/submit`
- Added `APOTH_MDI_QUESTIONNAIRE_ID` stage config and MDI Lambda env/IAM wiring.
- Added tests for UI rendering/submission, orchestration invariants, route state text, Lambda auth/CSRF/provider behavior, stack routes/env/IAM, PHI-answer leakage guards, client tampering, idempotency claim, and MDI response validation.

## Important Decisions / Invariants
- Apoth does not persist questionnaire answers. Transient answers are sent to MDI and cleared client-side after success; DynamoDB writes are pointer/status only.
- Submit now validates server-owned MDI linkage before calling MDI: posted `patientId` and `caseId` must match DynamoDB linkage.
- Submit also validates `questionnaireId` against server configuration (`APOTH_MDI_QUESTIONNAIRE_ID`) before repository status/claim/provider calls.
- DynamoDB submission claim prevents concurrent duplicate provider calls and supplies a stable idempotency key to MDI.
- `saveSubmitted` updates the patient profile and linkage pointer but does not create reverse lookup records; linkage creation owns reverse lookups.
- Production MDI submit parser rejects ambiguous 200 responses that lack a string submission id and status, avoiding local advancement on unexpected provider payloads.
- Fresh MDI patient/case creation/linkage remains out of T-022 scope and is tracked by T-055/T-056. Storybloq filed ISS-024 for the explicit deferred fresh-linkage gap.

## Verification
After final fixes:
- Root `npm test`: exit 0, 36 files, 328 tests passed.
- `npm run typecheck`: exit 0.
- `npm run build:static`: exit 0, `/onboarding/mdi` prerendered static.
- Infra `npm run build`: exit 0.
- Infra `npm test`: exit 0, 6 files, 62 tests passed.
- `git diff --check`: exit 0.

## Review History Notes
- Multiple review rounds were required by Storybloq gates and found real issues:
  - production gateway fallback/config wiring,
  - concurrent double submit,
  - MDI env vars on the wrong lambdas,
  - server-owned linkage validation,
  - idempotency after provider success/local save failure,
  - questionnaireId tampering,
  - reverse lookup conflicts after provider submit,
  - ambiguous MDI 200 submit payloads.
- Final review round approved with one non-blocking note: once the real MDI response contract is confirmed, future work can pin allowed submit `status` values instead of accepting any string.

## Current Worktree
- T-022 commit is complete at `99074059ce43052b9b485ca23436d235e66ec586`.
- Worktree after commit only had unrelated untracked handover checkpoint files:
  - `.story/handovers/2026-06-10-03-checkpoint.md`
  - `.story/handovers/2026-06-10-04-auto-session.md`
  - `.story/handovers/2026-06-10-05-checkpoint.md`
- These were intentionally not staged in the T-022 commit.

## Next Up
- Continue with T-055/T-056 for MDI patient/case creation and case/questionnaire submission flow, since T-022 now consumes existing linkage.
- Consider a future provider-contract tightening task once MDI confirms exact submit response status values.
