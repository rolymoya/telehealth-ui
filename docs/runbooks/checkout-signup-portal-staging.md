# Staging Runbook — Checkout, Signup, and Intake Handoff

## Required Configuration

- `APOTH_STAGE=staging`
- `APOTH_CHECKOUT_UI_MODE=custom`
- `APOTH_STRIPE_PUBLISHABLE_KEY=pk_test_...` for infrastructure output
- `VITE_APOTH_STAGE=staging`
- `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` for the patient-app build
- `APOTH_STRIPE_INTEGRATION_IDENTIFIER=apoth_enrollment_qjxmzvra` unless Stripe
  assigned a different stable identifier
- Populated staging Stripe and app-signing Secrets Manager records
- Stripe webhook endpoint subscribed to:
  `checkout.session.completed`, `setup_intent.succeeded`, and the existing
  billing event set

Do not use a live publishable key in staging. The patient app fails closed when
the key is missing or its stage prefix is wrong.

## Pre-deploy Verification

Run, in order:

```sh
npm run typecheck
npm run build
npm run patient:build
npm test
npm --prefix infra run build
npm --prefix infra test
npm run test:e2e
npm --prefix infra run synth:staging
npm run build:static
```

Inspect the synthesized change set for the four `/api/enrollment/*` routes,
four enrollment Lambda handlers, `/checkout*` patient-app behavior, the CSP
response policy, DynamoDB TTL use, and bounded IAM grants.

## Deploy

1. Set `APOTH_CHECKOUT_UI_MODE=hosted` and deploy the CDK staging stack so the
   backend supports both response types while the hosted response remains
   active.
2. Build the patient app with the staging `pk_test_` key.
3. Upload `out/` to the marketing bucket and `dist/patient-app/` to the patient
   app bucket using the repository deployment procedure.
4. Invalidate the changed CloudFront HTML and patient assets.
5. Set `APOTH_CHECKOUT_UI_MODE=custom`, redeploy the staging stack, and confirm
   the `CheckoutUiMode` output is `custom`.

## Manual Acceptance

Use a new private browser window:

1. Open the staging weight page and confirm every “Get started” action reaches
   `/checkout?product=weight`.
2. Confirm the page shows the exact plan, `$99 per month after clinical
   approval`, and `$0 due today`.
3. Confirm available Apple Pay, Google Pay, Link, and card methods are rendered
   by Stripe. Wallet availability depends on browser/device/domain eligibility.
4. Cancel a wallet sheet. The checkout must remain usable and must not show a
   payment error.
5. Submit with a Stripe test payment method and accepted consent. Double-click
   the final button and confirm only one SetupIntent/Checkout attempt results.
6. Confirm the completion page waits for the webhook before showing account
   verification.
7. Complete the Cognito email code flow. Confirm the app continues to
   `/intake`.
8. Inspect DynamoDB: the pending enrollment is `identity_bound`, contains
   opaque pointers only, and the Stripe linkage is
   `payment_method_collected`.
9. Inspect Stripe: there is no PaymentIntent charge or subscription. Metadata
   contains only `apoth_order_id` and `apoth_stage`.
10. Refresh checkout and completion pages. Confirm the attempt resumes without
    a duplicate Session or an exposed `client_secret` in URL, storage, or logs.

## Operational Checks

- CloudWatch enrollment functions have no unhandled errors.
- Stripe webhook events are processed once; retry/DLQ alarms remain clear.
- Browser developer tools show no CSP violations for Stripe.js, Elements,
  wallets, Link, or 3DS.
- API responses and CloudFront checkout HTML use `cache-control: no-store`
  where appropriate; the completion URL is clean after load.

## Rollback

Set `APOTH_CHECKOUT_UI_MODE=hosted`, synthesize, and redeploy the staging stack.
The UI redirects directly to Stripe-hosted Checkout and retains the same
consent, webhook, Cognito binding, and clinical billing gates. Do not weaken CSP,
disable signature verification, or create a subscription as a rollback.
