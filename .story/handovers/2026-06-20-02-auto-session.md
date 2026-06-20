# Session Handover — T-096 / T-098 / T-097

## Completed
- T-096 committed as `51c53db` (`feat: improve sign-up password UX (T-096)`). Added visible password requirements, local validation, safe Cognito error mapping, and tests while avoiding clinical fields and verification-code storage/logging.
- T-098 committed as `152b4f6` (`feat: continue sign-up through verification (T-098)`). Sign-up now transitions inline to email verification, carries email only in component state, preserves safe `returnTo=/get-started`, and requires explicit sign-in after verification.
- T-097 committed as `4c0c704` (`feat: make get-started the start entrypoint (T-097)`). Replaced the `/get-started` redirect shell with an account-first static start/resume page, added the cookie-auth `/api/onboarding/start` Lambda, wired API Gateway/permissions, and added focused frontend/infra/e2e expectation coverage.

## Key Decisions
- Preserved the thin-PHI posture throughout: no clinical fields added to sign-up or verification, no verification-code logging/storage, and no questionnaire-answer persistence in Apoth.
- `/api/onboarding/start` reads or creates only the minimal `patientProfile` record at `PATIENT#<sub>` / `PROFILE`; it does not touch MDI, Stripe, billing, consent evidence, Persona/KYC, or questionnaire-answer records.
- Consent acceptance now advances only the minimal profile status to `intake_ready` after recording consent evidence, so `/get-started` can route a signed-in patient from profile state alone.
- Addressed Round 2 review race: if consent profile creation conflicts with a concurrent `/api/onboarding/start` profile creation, the consent Lambda rereads and updates the concurrently created `profile_pending` profile.
- Updated stale public e2e expectations for the new `/get-started` heading/copy and preserved public education links (`See what we treat`, `How a visit goes`).
- L-004 was followed: review effort stayed risk-gated; low-risk work used targeted agent review rather than expanding into a full multi-lens loop.

## Verification
- `npm test -- src/app/__tests__/auth-panel.test.tsx` passed during T-096/T-098 work.
- `npm test -- src/app/__tests__/get-started-page.test.tsx` passed (4/4).
- `npm --prefix infra test -- test/consent-lambda.test.ts test/onboarding-start-lambda.test.ts test/serverless-platform-stack.test.ts` passed (45/45).
- `npm run typecheck` passed.
- `npm --prefix infra run build` passed.
- Full `npm test` still exits 1 due a known unrelated failure in `src/app/__tests__/intake-static.test.ts`: it expects `packageJson.scripts["build:static"]` to contain `next build`, while `package.json` currently uses `node scripts/build-static.mjs`. Latest run: 35 files passed, 1 failed; 337/338 tests passed.

## Reviews
- T-097 completed three Storybloq review rounds with agent reviewer `019ee6a9-0162-7d41-9b31-dad30748f7bc`; Round 3 approved.
- One issue was filed during T-096: `ISS-025` for the account-existence disclosure posture around Cognito `UsernameExistsException` handling.

## Next
- Decide whether to update or retire the stale `intake-static` build script expectation so full root `npm test` can return green again.
- Deploy/stage the new `/api/onboarding/start` route with cookie-auth session support and exercise signed-out, signed-in profile_pending, consent-complete, and billing-ready paths in staging.