# Staged Enrollment — White-label Patient Portal

## Outcome

The launch journey is a staged hybrid. Patients see a realistic self-pay range,
complete a short privacy-aware precheck, verify a passwordless account, and
then complete the clinical questionnaire in the selected provider's
white-label portal. Apoth can save a Stripe payment method after intake, but
the amount due remains $0 and no subscription begins at that step.

After clinical approval, Apoth presents the exact approved commercial offer.
The patient must separately accept the exact first and monthly amount before
the first charge or subscription can be created.

MD Integrations remains a legacy adapter during migration. It is not the
target patient-facing questionnaire experience. Production portal launches
remain fail-closed until a provider and its signed-launch contract are
configured.

## Patient Flow

1. A public weight-management CTA opens `/get-started?product=weight`.
2. The patient reviews the price range, what it includes, lab exclusions,
   renewal timing, cancellation terms, and compounded-medication disclosure.
3. `/intake?product=weight` records the current privacy-notice acknowledgement
   and runs a short routing precheck. It does not collect clinical history.
4. If the precheck can continue, the browser receives a signed, HttpOnly,
   short-lived precheck context containing only residency and product routing.
5. The patient verifies an Apoth account with a Cognito email OTP. No password
   is required for new enrollment. Existing password accounts can still use
   the legacy sign-in route.
6. `/api/onboarding/start?product=weight` binds the signed precheck context to
   the verified Cognito subject and stores minimal onboarding state.
7. `/portal/launch` creates or resumes an opaque provider linkage and performs
   a single-use authenticated redirect into the provider's secure portal.
8. The provider owns the full clinical intake, clinical record, review, and
   treatment decision. Apoth never renders or persists questionnaire answers.
9. After intake, `/billing` can save a Stripe payment method in Setup mode.
   Due today is $0 and saving the method does not authorize a subscription.
10. After a signed provider event marks the case `billing_ready`,
    `/billing/activate` displays the exact approved first and recurring amount.
11. A separate checkbox and submit action records the versioned recurring
    authorization for that exact case, Stripe Price, amount, and offer version.
12. Billing activation verifies the live Stripe Price is active, USD, monthly,
    and equal to the displayed amount before creating one idempotent
    subscription. Any mismatch fails closed without a charge.

## Stored State

Apoth stores only the minimum pointer and workflow state needed to operate the
journey:

- Cognito subject and opaque patient/provider linkage IDs.
- Residency, selected product, onboarding status, and billing status.
- Versioned consent acknowledgements and timestamps.
- Opaque Stripe customer, payment-method setup, and subscription IDs.
- The accepted commercial offer ID, case ID, Stripe Price ID, amount, currency,
  interval, authorization version, and acceptance timestamp.
- Bounded webhook idempotency and evidence records.

Apoth does not store clinical questionnaire answers, diagnoses, symptoms,
medication history, clinician notes, full card data, Cognito OTP codes, or
Cognito challenge sessions in readable browser storage. Stripe metadata is
limited to opaque IDs and deployment stage; it contains no product, treatment,
condition, email, or free text.

## Trust Boundaries

- Anonymous privacy and precheck state is signed, short-lived, HttpOnly,
  Secure, and SameSite-protected.
- Email-OTP challenge state is encrypted and HttpOnly; Cognito makes the
  challenge one-time and time-limited.
- Mutation routes require same-origin requests and expected content types;
  authenticated mutations additionally use scoped CSRF tokens.
- `/portal` is edge-auth protected. Patient, account, onboarding, billing, and
  auth pages receive private no-store, no-referrer, and no-index headers.
- Only verified provider and Stripe events can advance clinical and billing
  mirrors. Local status is not a clinical source of truth.
- Saving a payment method, receiving clinical approval, and accepting an exact
  offer are independent gates. All three must pass before activation.
- Stripe and provider side effects use stable idempotency keys. Closure races
  trigger compensating subscription cancellation before local activation.

## Recovery and Legacy Routes

- `/checkout` redirects to the staged `/get-started` journey. Existing
  `/checkout/complete` state remains only for recovery from attempts created
  before the migration.
- `/onboarding/mdi` redirects to `/portal/launch` and does not render a legacy
  clinical questionnaire.
- Missing or stale consent/linkage state returns to the earliest safe current
  step. It never sends a patient into the retired questionnaire UI.
- Reopening an accepted offer is idempotent. A changed amount, Stripe Price,
  case, or authorization version produces a new offer that must be accepted.

## Deployment Contract

- `APOTH_ENROLLMENT_BINDING_ENABLED=true` enables the passwordless verification
  and verified precheck binding seam.
- `STRIPE_RECURRING_PRICE_ID` identifies the approved recurring Stripe Price.
- `APOTH_BILLING_PRICE_CENTS` is the exact amount displayed for authorization;
  runtime activation compares it with the live Stripe Price.
- `APOTH_BILLING_AUTHORIZATION_VERSION` defaults to `billing-offer-v1` and must
  change when recurring authorization language materially changes.
- `APOTH_BILLING_ACTIVATION_ENABLED=true` permits activation only after all
  clinical, payment-method, disclosure, and offer-acceptance gates pass.
- The selected provider adapter must supply a production-safe HTTPS launch,
  signed event verification, opaque linkage, and an approved compliance/BAA
  path. Until then, production portal launch stays unavailable by design.

## Rollback

Disable billing activation or provider launch independently. Existing state is
pointer-based and idempotent, so no clinical-data migration is required.
Legacy checkout-completion records can continue their bounded recovery path,
while new public CTAs remain on staged enrollment.
