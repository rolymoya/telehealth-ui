# Staging Runbook — Precheck, Passwordless Account, and Portal Handoff

## Required Configuration

- `APOTH_STAGE=staging`
- A valid app-signing secret in Secrets Manager
- Cognito Essentials tier with `EMAIL_OTP` and `ALLOW_USER_AUTH` enabled
- `APOTH_CHECKOUT_CATALOG_WEIGHT_ID=catalog_...`
- `APOTH_PORTAL_PROVIDER=synthetic` for staging only
- `APOTH_PORTAL_LAUNCH_ORIGIN=https://...` on an approved staging origin
- `APOTH_PORTAL_LAUNCH_ENABLED=true` and
  `APOTH_PORTAL_PROVISIONING_ENABLED=true` only when intentionally exercising
  the synthetic staging portal
- Stripe test credentials plus `STRIPE_RECURRING_PRICE_ID`,
  `APOTH_BILLING_PRICE_CENTS`, and `APOTH_BILLING_AUTHORIZATION_VERSION`

Never enable the synthetic portal provider in production. Do not use live
payment credentials or real patient information in staging.

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

Inspect the synthesized change set for the email-OTP start/confirm routes,
onboarding-start binding, portal-launch route, billing-offer GET/POST route,
Cognito email-OTP policy, DynamoDB access, app-signing-secret access, and
bounded Cognito `ListUsers`/`AdminCreateUser` permissions.

## Manual Acceptance

Use a new private browser window and only synthetic values:

1. Open `/weight-loss`. Confirm every live weight CTA reaches
   `/get-started?product=weight`.
2. Confirm the public page shows the realistic monthly range, what is included,
   lab exclusions, `$0` due before intake, renewal timing, cancellation terms,
   and the compounded-medication disclosure.
3. Start the visit. Confirm `/intake?product=weight` shows the privacy notice
   before any precheck fields.
4. Complete the short precheck. Confirm no clinical-history or medication
   questionnaire appears and no answer is written to local/session storage.
5. Enter the synthetic email and complete the six-digit Cognito email code.
   Confirm no password is requested.
6. Confirm `/get-started?product=weight` consumes the signed precheck context,
   binds it to the Cognito subject, and continues to `/portal/launch`.
7. Confirm the portal route POSTs an explicit launch intent and redirects only
   to the configured HTTPS origin. Replays may create new single-use launches
   but must not create duplicate provider linkage.
8. Complete the synthetic provider intake and deliver a signed
   `billing_ready` event for the same opaque case.
9. Open `/billing`, save a Stripe test payment method, and confirm due today is
   `$0`. Verify there is no subscription or charge.
10. Open `/billing/activate`. Confirm the exact first and monthly amount, accept
    the separate authorization, and submit it once.
11. Confirm activation retrieves the live Stripe Price, matches its active
    flag, USD currency, monthly interval, and amount, then creates exactly one
    subscription.
12. Replay the offer submission and provider/Stripe events. Confirm no duplicate
    subscription, charge, linkage, or evidence record is created.

## Privacy and Security Checks

- Patient, account, intake, portal, and billing pages return private no-store,
  no-referrer, and no-index headers.
- No third-party advertising pixels load on those routes.
- OTP challenges and precheck state appear only in encrypted/signed HttpOnly
  cookies, never local storage, URLs, application logs, or analytics.
- Stripe metadata contains opaque IDs and stage only. It contains no email,
  product, condition, medication, or questionnaire content.
- The portal redirect includes no readable clinical data and rejects an
  unapproved origin.

## Failure Drills

- Disable portal launch. Expected: patient-safe unavailable state and no
  provisioning attempt.
- Remove the app-signing secret. Expected: privacy/precheck and OTP flows fail
  closed without setting a usable cookie.
- Use an expired or incorrect OTP. Expected: no session cookie and a bounded
  patient-safe error.
- Attempt portal launch without consent, residency, weight selection, or auth.
  Expected: 401/403 and no provider side effect.
- Mismatch `APOTH_BILLING_PRICE_CENTS` and the Stripe Price. Expected:
  `invalid_stripe_price`, no subscription, and no charge.

## Rollback

Set both portal enable flags and billing activation to `false`, then synthesize
and redeploy. Public staged enrollment and account binding can remain available
while portal launch and charging fail closed. Do not restore checkout-first
collection, weaken origin/signature checks, or bypass exact-offer acceptance as
a rollback.
