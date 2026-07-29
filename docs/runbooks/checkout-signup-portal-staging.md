# Checkout-as-Signup Staging Runbook

Use this runbook to enable and verify the new storefront-to-portal journey with
Stripe test mode and synthetic patient data. The clinical portal adapter is
synthetic-only until a vendor, BAA, credentials, event contract, and production
launch origin are approved.

## Safety invariants

- Signup uses Stripe Checkout `mode=setup`. It must create no PaymentIntent,
  invoice, charge, or subscription.
- Stripe metadata is limited to opaque `apoth_order_id` and `apoth_stage`
  values before account binding. Never enter a condition, treatment,
  medication, answer, email, name, or portal token in Stripe metadata or logs.
- A Checkout redirect is not proof. Only a verified Stripe event advances
  payment setup to `setup_succeeded`.
- Email OTP must be consumed before the Stripe Customer is bound to a Cognito
  subject or a portal launch is authorized.
- `APOTH_BILLING_ACTIVATION_ENABLED` remains `false` until the selected
  clinical provider's signed approval event and reconciliation contract pass
  staging. Saving a payment method alone never activates billing.

## Staging configuration

Configure non-secret deployment values without committing real IDs:

```text
APOTH_CHECKOUT_SIGNUP_ENABLED=true
APOTH_ENROLLMENT_BINDING_ENABLED=true
APOTH_CHECKOUT_CATALOG_WEIGHT_ID=catalog_<opaque>
APOTH_CHECKOUT_CATALOG_HAIR_ID=catalog_<opaque>        # optional
APOTH_CHECKOUT_CATALOG_SEXUAL_HEALTH_ID=catalog_<opaque> # optional
APOTH_STRIPE_INTEGRATION_IDENTIFIER=<approved identifier ending in eight letters>

APOTH_PORTAL_PROVIDER=synthetic
APOTH_PORTAL_PROVISIONING_ENABLED=true
APOTH_PORTAL_LAUNCH_ENABLED=true
APOTH_PORTAL_LAUNCH_ORIGIN=https://<synthetic-staging-host>

APOTH_BILLING_ACTIVATION_ENABLED=false
```

The static publish build must also receive the distribution outputs:

```text
NEXT_PUBLIC_ACCOUNT_ORIGIN=https://<patient-distribution-host>
VITE_MARKETING_ORIGIN=https://<marketing-distribution-host>
```

Without `NEXT_PUBLIC_ACCOUNT_ORIGIN`, a marketing CTA would incorrectly try to
open `/checkout` on the marketing distribution. The deployment workflow treats
both distribution outputs as required and injects these values before either
artifact is built.

CDK supplies the account and marketing origins from their separate CloudFront
distributions. Verify the generated `APOTH_ACCOUNT_ORIGIN`,
`APOTH_MARKETING_ORIGIN`, `APOTH_ALLOWED_ORIGINS`, and `NEXT_PUBLIC_SITE_URL`
values before testing. Keep both portal flags false in production: the runtime
rejects an enabled synthetic production adapter.

Stage secrets remain in Secrets Manager. The Stripe secret payload needs the
test restricted API key and the stage-specific current webhook signing secret.
The app-signing payload needs the enrollment-cookie, session, and fingerprint
keys required by the startup validator. Do not put secret values in shell
history, CDK context, screenshots, or this runbook.

## Stripe Dashboard setup

1. Use Stripe test mode and set the business terms-of-service URL required by
   Checkout consent collection.
2. In payment-method settings, enable cards, Apple Pay, and Link as eligible
   dynamic methods. The application deliberately does not send
   `payment_method_types`.
3. Register the staging webhook endpoint at
   `https://<account-host>/api/webhooks/stripe` with these events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `setup_intent.succeeded`
   - `setup_intent.setup_failed`
   - `payment_method.attached`
   - the existing subscription, invoice, refund, dispute, and payment-failure
     events listed in `stripeWebhookEventContracts`.
4. Store the resulting signing secret in the staging Stripe secret payload.
   Do not reuse a Stripe CLI signing secret for the deployed endpoint.

Hosted Checkout handles Apple Pay domain validation. If Apoth later embeds
Checkout or Payment Element, register every top-level and iframe domain before
testing Apple Pay.

## Enablement order

1. Deploy with every new feature flag false and verify both CloudFront
   distributions, `/health`, webhook signature rejection, queues, DLQ, alarms,
   and Cognito `USER_AUTH`/`EMAIL_OTP` configuration.
2. Enable Checkout for staging catalog codes. Leave account binding and portal
   flags false. Confirm Checkout creates a Customer and succeeded SetupIntent
   but no charge or subscription.
3. Enable enrollment binding. Complete the email OTP and confirm exactly one
   Cognito subject, email claim, Stripe Customer claim, account enrollment, and
   active enrollment pointer are committed.
4. Enable synthetic portal provisioning, then launch. Confirm the browser uses
   a same-origin form POST, receives a `303`, and reaches only the allowlisted
   HTTPS synthetic host. Retry and concurrent-launch tests must not mint
   parallel patient identities.
5. Keep billing activation false. A real provider adapter is a separate launch
   gate and requires signed/replay-resistant clinical events plus billing
   reconciliation before activation.

## Acceptance checks

- Marketing remains on the marketing distribution; `/checkout` and `api/*`
  are available only through the account distribution.
- Product CTAs preserve only the public product code; browser input cannot
  select an internal catalog ID or price.
- The Checkout page and Stripe page say `$0 today` and explain that payment can
  occur only after independent clinical approval.
- An eligible Safari/iPhone test wallet shows Apple Pay. An ineligible browser
  falls back to card or Link without changing account behavior.
- `checkout.session.completed` and `setup_intent.succeeded` converge in either
  delivery order. Replaying either event leaves the enrollment unchanged.
- A wrong-stage or mismatched Customer/Session/SetupIntent never binds or
  launches an account.
- The completion/status responses reveal only bounded state codes—never email,
  Stripe IDs, provider IDs, or launch URLs.
- The OTP challenge is single use and mode bound. A returning sign-in
  challenge cannot claim a pending enrollment.
- No native intake questionnaire or MDI care UI is reachable from the active
  patient route map.
- There is no PaymentIntent, invoice, charge, or subscription for the signup.

## Webhook recovery and reconciliation

Stripe is authoritative for setup completion. The receiver uses a durable
event claim, processing lease, bounded retry, SQS handoff, and DLQ. Checkout
and SetupIntent reducers use direct enrollment keys and optimistic versions;
they never scan the patient table.

If completion remains in `checkout_processing`:

1. Use the opaque Checkout Session or enrollment reference to locate the event
   in the Stripe Dashboard. Do not search by or paste patient email into logs or
   tickets.
2. Check the Stripe endpoint delivery status, the webhook processing-failure
   alarm, queue age, and DLQ depth. Operational notes contain only the opaque
   event ID and bounded reason code.
3. Redeliver the original signed Stripe event from Stripe. If SQS owns the
   retry, wait for or safely redrive that opaque pointer before provider
   redelivery so two workers do not compete.
4. Confirm the event claim becomes `processed` and the enrollment reaches both
   `checkout=completed` and `paymentSetup=setup_succeeded`.
5. Never manually mark setup successful from a browser redirect, screenshot,
   support assertion, or payment-method display. Escalate a persistent
   mismatch for opaque linkage repair.

Existing Stripe/legacy-MDI billing reconciliation continues to detect active
subscription drift during migration. It does not authorize the new clinical
provider. The replacement provider must supply an equivalent direct-key,
signed-event and authoritative-read reconciliation adapter before the billing
flag can be enabled.

## Rollback

Disable gates in this order; do not delete external resources:

1. Set `APOTH_CHECKOUT_SIGNUP_ENABLED=false` to stop new purchases. In-flight
   Stripe events continue processing so existing attempts can settle safely.
2. Set `APOTH_ENROLLMENT_BINDING_ENABLED=false` to stop new OTP starts and
   account claims. Existing Cognito users and Stripe Customers remain intact.
3. Set `APOTH_PORTAL_LAUNCH_ENABLED=false` to stop new launches, then
   `APOTH_PORTAL_PROVISIONING_ENABLED=false` to stop new vendor identities.
   Already launched patients remain in the vendor portal.
4. Keep `APOTH_BILLING_ACTIVATION_ENABLED=false`. Disabling activation does
   not disable cancellation or Stripe state mirroring.
5. Preserve webhook processing until queues are drained or quarantined. Never
   purge the DLQ as a shortcut; retain opaque event references for repair.

Rollback never deletes Cognito users, Stripe Customers, saved payment methods,
portal identities/cases, or durable evidence. Re-enable one gate at a time only
after direct-key reconciliation and the corresponding acceptance checks pass.
