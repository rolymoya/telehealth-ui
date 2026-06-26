# Billing Activation Smoke Runbook

Use this runbook to verify the T-025 billing activation path before launch or
after billing configuration changes. Run it only with synthetic test accounts,
Stripe test mode, and synthetic MDI sandbox events. Do not use real patient
data, real clinical answers, medication names, condition names, or live payment
methods.

## Required Configuration

- `STRIPE_RECURRING_PRICE_ID` must be set for the deployed stage.
- The value must be a single Stripe recurring Price ID for the Apoth account
  workflow, for example `price_...`.
- Do not select the Price ID from condition, medication, diagnosis,
  questionnaire answer, clinician note, or MDI case content.
- Stripe API credentials and webhook signing secrets must come from the stage
  secret contract, not client code or committed files.
- Configure the current Stripe webhook signing secret. Configure the previous
  secret and expiry only during rotation.
- Keep staging and production separated by `APOTH_STAGE`, Stripe mode, secret
  source, webhook endpoint, and app-data table name.

## Test-Mode Smoke

1. Create or choose a synthetic patient account whose test profile has no PHI.
2. Complete the payment-method setup path from `/billing` in Stripe test mode.
3. Confirm local Stripe linkage is non-active:
   - `billingStatus` is `payment_method_collected`.
   - `stripeCustomerId` is present.
   - `stripeSubscriptionId` is absent.
4. Deliver the selected MDI unlock signal for the same synthetic MDI case:
   - MDI mirrored status is `billing_ready`.
   - The unlock decision evidence is `activate_billing`.
5. Confirm exactly one Stripe subscription is created:
   - The subscription uses `STRIPE_RECURRING_PRICE_ID`.
   - The subscription is attached to the synthetic Stripe customer.
   - Local `billingStatus` becomes `active`.
   - Local `stripeSubscriptionId`, `stripeCurrentPeriodStart`, and
     `stripeCurrentPeriodEnd` are mirrored.
6. Replay the same unlock event or webhook delivery.
7. Confirm no second subscription is created and local state still points to the
   first subscription.

## Webhook Checks

- Stripe webhook requests without a valid signature must return the invalid
  signature response and create no app-data mutation.
- Duplicate Stripe event IDs must be idempotent through webhook idempotency
  records.
- Late `invoice.payment_succeeded` events must not revive a canceled
  subscription.
- `customer.subscription.updated` with `cancel_at_period_end: true` should
  mirror `cancel_pending` locally.
- Missing `STRIPE_RECURRING_PRICE_ID`, an invalid Stripe secret, missing webhook
  signing secret, or an unavailable app-data table must fail closed with
  patient-safe `billing_unavailable` behavior.

## Metadata Inspection

Inspect the test Stripe Customer, Checkout setup Session, and Subscription.
Apoth-controlled metadata may contain only policy-approved opaque keys from
`docs/stripe-data-policy.md`, such as:

- `app_patient_id`
- `apoth_stage`
- `cognito_sub`
- `mdi_case_id`
- `mdi_patient_id`

The inspected Stripe objects must not contain condition, medication, diagnosis,
symptom, health goal, questionnaire question, questionnaire answer, clinician
note, MDI workflow URL, MDI workflow token, support free text, or case details
in metadata, descriptors, descriptions, product names, or logs controlled by
Apoth.

## Expected Evidence

For the synthetic account, expected evidence includes:

- `stripe_payment_method_collected` once for payment-method readiness.
- `mdi_billing_unlock_decision` with `billing_action: activate_billing`.
- `stripe_billing_activated` once for the created subscription.

For replay, expect no additional Stripe subscription and no conflicting
activation evidence. Conditional-conflict retries are acceptable only when they
resolve to the same stored subscription.

## Failure Drills

- Remove or blank `STRIPE_RECURRING_PRICE_ID` in a non-production test stage and
  replay the unlock path. Expected: activation does not create a subscription
  and the route or webhook returns retryable billing-unavailable behavior.
- Send the unlock before payment-method collection. Expected: no subscription,
  decision remains waiting for payment method, and no active billing mirror.
- Send a clinical closure after activation in test mode. Expected: Stripe
  cancellation is attempted, local billing mirror moves to `canceled`, and
  evidence remains bounded to opaque IDs and status codes.
- Send duplicate unlock and duplicate Stripe subscription webhooks. Expected:
  one subscription, stable local linkage, and no PHI in metadata or evidence.

## Operator Notes

- Keep screenshots or copied evidence redacted to opaque IDs and status codes.
- Do not paste webhook payloads, raw headers, Stripe secrets, or payment-method
  details into tickets or support notes.
- Do not use the MDI internal patient subscription cancel endpoint for this
  smoke. It remains default-deny for Apoth until a future architecture decision
  approves it.
