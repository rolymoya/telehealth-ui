# Development Rules — Apoth

## Compliance (non-negotiable)

- This is a LegitScript-track telehealth site. Apoth is a **technology
  platform, not a medical provider** — never write copy implying Apoth
  practices medicine or prescribes.
- Compounded medications carry an explicit "Not FDA-approved" badge and the
  qualifier distinguishing them from Ozempic/Wegovy/Mounjaro/Zepbound.
- `/privacy` and `/terms` keep the `LegalReviewBanner` until a healthcare
  attorney signs off (T-028).
- Any user-visible value awaiting real data uses the visible `TODO:` chip:
  `font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep`.
- Never commit real PHI, secrets, or credentials.

## Design System (see DESIGN.md)

- **Committed Clay**: warm clay carries 30–60% of any screen.
- **Two-Voice**: clay leads, sage supports — never equal weight.
- **No Clinical Blue**: no blue anywhere.
- **Serif-Lead**: display/headline is always serif; sans never headlines.
- **Patient Floor**: body type >=16px, target 17-18px on reading surfaces.
- **Flat-By-Default**: shadows only on state (hover/focus), never at rest.
- No em dashes or double-hyphens in body copy; no gradient text; no
  side-stripe borders.

## Code & Data

- App Router conventions; light/dark `Nav` variant by background.
- Long-form legal pages use the local `Section` helper pattern.
- Per-branch feature docs in `docs/features/<branch>.md` for non-trivial work.

## Testing

- TDD for business logic: write tests first for clinical eligibility
  screening, state-availability gating, and payment-gating logic. These
  define the contract before implementation — the "no card charged before
  clinical confirmation" promise must be test-enforced.
- **Known pre-existing failures (ISS-006):** 7 tests in `tests/invariants/`
  fail because `isStateSupported` (T-020), `checkEligibility` (T-021), and
  `canActivateSubscription` (T-024) are unimplemented stubs. These failures
  are expected on all branches until those tickets ship. In autonomous mode,
  skip the test-retry loop when the only failures are these ISS-006 stubs —
  report `tests_run` with the failure count and immediately advance to
  code review without burning retry cycles.
