# Autonomous Session Handover: T-027 + T-090

## Completed

- T-027: Refunds, cancellation, and dunning sync
  - Commit: `45aaeb348b567aa6bce10b1f3df93d49de917fd7`
  - Added refund action runtime coverage, queued Stripe refund/dispute normalization, bounded refund evidence schema support, cancellation MDI-action seam, and dunning guard coverage.
  - Final code review passed after fixing runtime wiring/idempotency/audit concerns.

- T-090: Stripe billing timing and no-PHI metadata E2E specs
  - Commit: `99e94a7`
  - Added `tests/e2e/stripe-billing-timing.spec.ts` with browser coverage for pending clinical review lockout, generic approved/manual-review lockout, billing-ready Stripe Checkout setup, clinical decline, abandoned setup, cancellation, dunning, and refund-support states.
  - Extended the E2E network guard to record explicitly allowed external redirect requests so Stripe Checkout redirects can be asserted exactly while still blocking live network activity.
  - Metadata assertions now use the app's `buildStripeMetadata`/`validateStripeMetadata` helper and enforce the current Stripe metadata key policy.

## Review Decisions

- Contested a reviewer request to remove `mdi_case_id` and `mdi_patient_id` from Stripe metadata because current `docs/stripe-data-policy.md` and `src/lib/stripe-policy.ts` explicitly allow those opaque keys. This may be worth a future architecture/privacy policy decision, but it was out of scope for T-090.
- Hardened the browser tests to check actual `/billing` href destinations, not only accessible names, because dashboard action links use generic `Open` text.
- Kept local E2E fully mocked; no live Stripe, MDI, Cognito, or AWS calls.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 59 test files, 559 tests. Existing jsdom warnings appeared: `Not implemented: navigation to another Document`.
- Focused Playwright passed with escalated execution due sandbox dev-server `EMFILE` watcher failures: `npm run test:e2e -- tests/e2e/stripe-billing-timing.spec.ts`, 7/7 passed.

## Notes / Next

- The project now has stronger product-flow coverage around the launch billing invariant: payment setup may happen only as a deferred Stripe setup flow, and active billing remains gated by the MDI billing-ready unlock.
- A future policy ticket should decide whether Stripe metadata should continue to include opaque MDI IDs or move to Apoth-only aliases. Current code and docs allow the opaque MDI keys.
- Good next product-operational work: continue browser coverage around the dashboard/account flows, then address remaining launch blockers such as attorney-reviewed copy, production env/secrets checks, and deployment smoke paths.