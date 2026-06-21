# Handover: MDI docs, linkage hardening, charge webhooks, and care workflow posture

## Session

- Session: `7422d5fa-ad33-411b-a4e8-7f181d5a6e42`
- Date: 2026-06-21
- Branch: `main`
- Targeted work completed: ISS-026, ISS-027, ISS-025, T-059, T-061

## Commits

- `1c2bcb1` `test: cross-check MDI dashboard route docs (ISS-026)`
- `2e9d37f` `fix: make MDI status mirror updates atomic (ISS-027)`
- `76a4156` `docs: record auth existence disclosure posture (ISS-025)`
- `ca47eb4` `feat: handle MDI partner charge webhooks (T-059)`
- `d06ea8c` `feat: add MDI care workflow launch posture (T-061)`

## What Changed

ISS-026 added dashboard route-doc cross-check coverage so launch-surface docs stay aligned with the generated MDI endpoint index.

ISS-027 hardened MDI status mirror updates to be atomic so stale or partial updates do not overwrite newer linkage/status state.

ISS-025 documented the auth/account existence disclosure posture for Cognito-facing account flows.

T-059 implemented thin-PHI handling for MDI `partner_additional_charge` and `vouched_amount_charge` webhooks. Charge events now require an explicit provider event ID and `usd` currency, parse only safe amounts, persist bounded billing evidence, reject unsafe references, and fail closed on same-event fingerprint conflicts. No raw payloads, reference IDs, PHI-heavy details, or Stripe side effects are stored.

T-061 added a launch-safe MDI care workflow capability layer in `src/lib/mdi-care-workflows.ts`. It derives capability only from existing MDI linkage, exposes follow-up care through the approved `messaging` workflow when patient/case linkage exists, and keeps native Apoth refills deferred. It also documents the internal refill endpoint as default-deny and partner order/voucher reads as PHI-heavy/non-launch refill state.

## Validation

- T-059 focused tests passed: `npm test -- src/lib/__tests__/mdi-webhooks.test.ts src/lib/dynamodb/__tests__/app-data.test.ts src/lib/__tests__/mdi-artifacts.test.ts`
- T-061 typecheck passed: `npm run typecheck`
- T-061 focused tests passed: `npm test -- src/lib/__tests__/mdi-care-workflows.test.ts src/lib/__tests__/mdi-workflows.test.ts src/lib/__tests__/dashboard-surface-doc.test.ts`
- Full `npm test` was run repeatedly and still fails only on ISS-028: `src/lib/__tests__/mdi-intake.test.ts` uses invalid Cognito subject fixture `cognito-sub-mdi-intake`, causing 3 `Invalid MDI case create attempt record` failures. Latest full-suite summary: 1 failed file, 42 passed; 3 failed tests, 421 passed.

## Reviews

- T-061 plan review approved by agent `019ee8c7-b40b-7ff1-85bd-070b547e2d5a`.
- T-061 code review approved by the same agent with no findings.
- Review caveat: future dashboard/API wiring should re-check auth scoping, `Cache-Control: no-store`, and copy semantics so `refills_deferred` does not imply native Apoth refill submission.

## Open Issues / Next Items

- ISS-028 remains open and is the current full-suite blocker. Fix the invalid Cognito subject fixture in `src/lib/__tests__/mdi-intake.test.ts`, then rerun full `npm test`.
- Likely next MDI/dashboard work: T-060/T-062/T-063, using the approved partner/webhook surfaces only and preserving the strict thin-PHI boundary.
- Keep untracked `.story/handovers/*` files out of unrelated commits unless intentionally recording them.

## Thin-PHI Decisions To Preserve

- Apoth does not store questionnaire answers, clinical content, raw MDI payloads, full workflow URLs/tokens, prescription/refill/order details, or PHI-heavy partner/voucher/order responses.
- Stripe metadata remains opaque and non-PHI only.
- Internal MDI patient-app refill route `internal-post-v1-patient-patients-patient-subscriptions-subscription-id-refill-refill-subscription` is default-deny for launch.
- Follow-up care can use the approved MDI messaging workflow; native Apoth refill processing is deferred.
