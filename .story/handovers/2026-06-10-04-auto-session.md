# Autonomous Session Handover -- Intake Flow Progress

Session: `a17f41ed-5f49-4e59-af0b-d47ce5f296db`
Branch: `codex/architecture-reset-audit`
Latest commit: `782cde6 feat: add product route recovery states (T-019)`

## Completed in this session

- T-047: consent versioning evidence records (`99033b9`).
- T-018: Cognito-gated onboarding journey orchestration (`cfdfb44`).
- T-093: consent acceptance screen and evidence write (`bd7eb9b`).
- T-021: static intake precheck flow (`257ecb5`).
- T-019: product error/loading/not-found/provider-unavailable states (`782cde6`).

## T-019 summary

Implemented reusable patient-safe product route states, root/scoped App Router `error.tsx`, `loading.tsx`, and `not-found.tsx` surfaces, MDI/billing unavailable states, `/account` as a static shell, intake bootstrap retry, static export for `/account` and `404.html`, and CloudFront clean-route fallback for unknown static routes without rewriting `/api/*` responses.

Important review fix: an initial distribution-wide CloudFront `CustomErrorResponses` approach was rejected because it could rewrite API Gateway `403/404` JSON responses under `/api/*` into static HTML. The final implementation keeps `CustomErrorResponses` absent and handles unknown static clean routes in the default static viewer-request function only; the `api/*` behavior remains separate.

Verification after the final fix:

- `npm test`: exit 0, 31 files passed, 293 tests passed.
- `npm --prefix infra test`: exit 0, 5 files passed, 53 tests passed.
- `npm run typecheck`: exit 0.
- `npm run build:static`: exit 0; `/account` is static and `out/404.html` plus `out/account/index.html` exist.
- `APOTH_STAGE=staging npm run build`: exit 0.
- `git diff --check`: exit 0.

## Remaining target work

The only remaining intake-flow leaf ticket is T-022: MDI-backed intake UI: render, submit, discard. Storybloq would not pick it because it is still marked blocked by T-010, T-016, T-018, T-021, and T-054.

Current ticket evidence shows T-010, T-016, T-018, and T-021 are complete. The real remaining blocker is T-054: MDI HTTP client single entrypoint, which is open and blocked by T-052 and T-053. To make T-022 workable, continue by completing the MDI integration prerequisites, especially T-052/T-053, then T-054.

## Working tree notes

After committing T-019, the tracked working tree was clean. The only untracked file observed was `.story/handovers/2026-06-10-03-checkpoint.md`, an automatic checkpoint from earlier in the session; it was intentionally left unstaged.

## Guardrails to preserve

- Apoth remains thin-PHI and must not persist clinical questionnaire answers after MDI handoff.
- MDI is the clinical source of truth.
- Product routes should remain static shells on S3/CloudFront with server behavior behind API Gateway/Lambda.
- Do not reintroduce distribution-wide CloudFront error responses that can affect `/api/*` JSON status handling.
- Stripe metadata must remain opaque and non-PHI.