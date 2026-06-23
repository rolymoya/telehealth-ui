# T-025 Autonomous Session Prompt

Start a new Story autonomous session for Apoth telehealth-ui focused on T-025.

Before coding:
- Read latest Story status, latest handovers, RULES.md, L-004, T-024, T-025, T-026, T-045, T-058, T-063, and T-078.
- Treat local commits `ded08b8` (T-024 clinically gated payment-method setup) and `2fd7f30` (T-064 MDI case-status reconciliation) as implementation evidence even if Story still lists those tickets open. Repair Story state only if safe and explicitly allowed by the current Story session guard.
- Keep untracked `.story/handovers/2026-06-21-05-auto-session.md` and unrelated `.claude/rules/` out of unrelated commits.

Product target:
- Implement T-025: Billing activation + subscription state mirror.

Launch billing contract:
- Launch billing uses one configured Stripe recurring Price ID.
- The Price ID must come from environment/configuration, not condition, medication, diagnosis, questionnaire, or other clinical text.
- Payment method collection may happen before clinical approval, but Stripe must not create a subscription, invoice, PaymentIntent, charge, or active billing state before the MDI billing unlock event.
- The only billing unlock is `billing_ready` / `case_clinically_approved`; generic MDI `approved` is not sufficient.
- After unlock, create the Stripe subscription and allow the first invoice to charge immediately.
- Duplicate unlock events must be idempotent and must not create duplicate subscriptions.
- Clinically declined or abandoned flows must leave no active billing.
- Local billing state is only a mirror with opaque IDs, Stripe customer/subscription IDs, billing status, current period timestamps, and bounded evidence metadata.
- Stripe metadata must contain only opaque non-PHI identifiers.

Thin-PHI posture:
- Do not store questionnaire answers, clinical content, raw MDI payloads, prescription/refill/order details, workflow URLs/tokens, or PHI-heavy partner/voucher/order responses.
- Do not send PHI or clinical labels to Stripe metadata, descriptors, logs, analytics, or support evidence.
- Keep dashboard billing state compatible with the T-063 patient dashboard.

L-004 review discipline:
- Because this touches payments, Stripe webhooks, MDI state, DynamoDB idempotency/concurrency, and PHI/privacy boundaries, run full multi-lens/agent review for the first implementation.
- After revise findings, batch fixes and re-review only the touched high-risk areas.

Test requirements:
- Write focused tests first for the no-charge-before-unlock invariant.
- Test that generic `approved` does not activate billing.
- Test that `billing_ready` / `case_clinically_approved` creates exactly one subscription.
- Test duplicate unlock events are idempotent.
- Test declined and abandoned flows do not create subscriptions, invoices, PaymentIntents, charges, or active local billing.
- Test Stripe metadata contains only opaque identifiers.
- Test Stripe webhook subscription-state mirroring updates local state without clinical leakage.
- Preserve or extend dashboard billing-state tests as needed.

Verification:
- Run focused payment/billing tests as work lands.
- Run `npm run typecheck`.
- Run relevant full `npm test` after payment/billing changes.
- For any UI changes, visually verify locally. If changes are pushed to `main` and GitHub Actions deploys the UI, use Chrome against production after the action completes.

Commit:
- Commit T-025 separately with only related files staged.
