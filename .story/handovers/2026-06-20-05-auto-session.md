# MDI Billing And Dashboard Session Handover

Session `c724df8a-c58f-47e1-a727-b3206b78a7da` completed the targeted work for T-078 and T-079.

## Completed Tickets

- T-078: Defined the MDI billing unlock contract. Commit: `8c7a5ef689aca1694e721c071d75bf2fa9185c6f feat: define MDI billing unlock contract (T-078)`.
- T-079: Defined the launch dashboard native-vs-embedded surface matrix. Commit: `b0a07f6 feat: define dashboard surface matrix (T-079)`.

## Key Decisions

- Billing activation is allowed only for `case_clinically_approved` when the event `mdiCaseId` matches the local billing target and the local payment method state is `payment_method_collected`.
- The launch dashboard is a native Apoth account/status shell around MDI and Stripe source systems.
- MDI remains the source of truth and interaction surface for clinical messages, files/labs, clinician workflow, refills/follow-up care, and other care content.
- Embedded MDI workflows must launch through short-lived user-scoped links. Iframe embedding remains deferred until T-062 proves URL lifetime, logging, and browser isolation are safe for the specific workflow.
- T-079 names concrete generated MDI partner operation slugs for launch-approved link flows:
  - `partner-get-partner-patients-patient-id-auth-get-messaging-app-url`
  - `partner-get-partner-patients-patient-id-file-url-get-file-request-url`
  - `partner-get-partner-patients-patient-id-intro-video-get-intro-video-request-url`
- Refills/follow-up, broader care workspace, exam/driver-license/preferred-pharmacy routes, and voucher/offering/order links remain deferred until downstream tickets validate an approved route.
- Voucher/offering/order dashboard cue ownership is T-060/T-063, not T-083.

## Thin-PHI Boundaries Preserved

- Apoth must not store questionnaire answers, clinical content, raw MDI payloads, raw Stripe payloads, full embedded URLs, URL tokens, message bodies, files/labs, prescriptions, clinician notes, or PHI-heavy support free text.
- Stripe metadata remains limited to opaque non-PHI IDs and billing-safe values.
- Dashboard rows permit only bounded status/action codes, opaque pointers, timestamps, retry/idempotency metadata, and minimal linkage records.

## Verification

- T-078 verification: `npm run typecheck` passed; full `npm test` passed before commit.
- T-079 focused verification: `npm test -- src/lib/__tests__/dashboard-surface-doc.test.ts src/app/__tests__/route-states.test.tsx` passed with 2 files / 9 tests.
- T-079 full verification: `npm run typecheck` passed; `npm test` passed with 41 files / 382 tests.
- T-079 code review round 2 approved with no blocking findings.

## Open Follow-Up

- `ISS-026` was filed for a non-blocking test coverage gap: the dashboard surface doc test asserts key route slugs are present in the matrix, but does not cross-check them against `docs/external/mdi/endpoint-index.jsonl`. The reviewer confirmed the current slugs are valid.

## Current State

- Branch: `main`.
- Latest commit: `b0a07f6 feat: define dashboard surface matrix (T-079)`.
- T-078 and T-079 are marked complete.
- Untracked handover checkpoint files remain intentionally unstaged: `.story/handovers/2026-06-20-03-checkpoint.md` and `.story/handovers/2026-06-20-04-auto-session.md`.

## Next Useful Work

- Continue with downstream MDI dashboard implementation tickets, especially T-060/T-061/T-062/T-063.
- For T-062, use only the launch-approved partner route slugs from `docs/dashboard/launch-surface-matrix.md`; do not add iframe support without a new review.
- For T-060/T-063, render only native status/action cues and keep clinical content in MDI.