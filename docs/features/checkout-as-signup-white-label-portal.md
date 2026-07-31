# Checkout as Signup — White-label Patient Enrollment

## Outcome

The launch enrollment path starts at `/checkout?product=weight`. Apoth renders
the plan, consent, email, and Stripe payment elements in the patient app. The
payment method is saved in Stripe Setup mode; no payment or subscription is
created at checkout. The patient verifies a Cognito account after Stripe
reports setup completion, then continues to `/intake`.

Production defaults to Stripe-hosted Checkout until the custom flow is
explicitly enabled. Staging defaults to custom Checkout. Both modes use the
same opaque pending-enrollment state and webhook completion path.

## Patient Flow

1. A public CTA opens `/checkout?product=weight`.
2. The browser sends a random initialization UUID. The server derives an
   opaque `apoth_order_*` identifier and sets a signed, HttpOnly,
   `__Host-apoth_enrollment_attempt` cookie.
3. The server creates or resumes one Stripe Checkout Session using an
   attempt-scoped idempotency key.
4. Custom mode returns only the Checkout Session `client_secret` to the
   current response. Hosted mode returns a validated `checkout.stripe.com`
   URL and redirects immediately.
5. The patient enters an email, selects a Stripe-provided payment method, and
   accepts the current server-versioned authorization. Apoth timestamps the
   consent before confirmation.
6. Stripe confirmation returns to `/checkout/complete`. The page removes
   provider query/hash data and waits for the signed webhook.
7. `checkout.session.completed` or `setup_intent.succeeded` changes the
   pending enrollment to `payment_setup_complete`.
8. The existing Cognito email-code UI creates or verifies the account. The
   authenticated bind endpoint links the opaque enrollment to `cognito_sub`,
   creates a minimal profile if necessary, and records billing status as
   `payment_method_collected`.
9. The patient continues to `/intake`. Existing clinical gating remains the
   only path that can activate billing after MDI clinical approval.

## Stored State

The DynamoDB pending-enrollment record contains:

- Opaque enrollment, Checkout Session, Stripe Customer, and SetupIntent IDs.
- Product code `weight`, checkout UI mode, attempt number, status, and TTL.
- Consent version and server timestamp.
- Payment-setup and identity-binding timestamps.
- Cognito subject only after the verified bind step.

It never stores the Stripe Checkout `client_secret`, email, card/wallet
details, clinical answers, medication context, or questionnaire content. The
browser keeps the `client_secret` in React/Stripe memory only.

## Stripe Contract

- API version: `2026-06-24.dahlia`.
- Checkout Session: `mode=setup`, `currency=usd`,
  `customer_creation=always`.
- Custom mode: logical mode `custom`, sent as `ui_mode=elements` for the pinned
  Stripe API `2026-06-24.dahlia`, with a clean `return_url`.
- Hosted rollback: `success_url` and `cancel_url`, with no custom-only fields.
- Dynamic payment methods: `payment_method_types` is omitted.
- Metadata: only `apoth_order_id` and `apoth_stage`.
- `integration_identifier`: stable per deployment contract.
- No product, treatment, condition, email, or free text is placed in metadata.

## Trust Boundaries

- The cookie is HMAC-signed with the rotating app-signing secret and expires
  with the DynamoDB TTL after 24 hours.
- All mutation routes require same-origin JSON requests. Checkout creation also
  requires the initialization header.
- The client cannot mark payment setup complete. Only verified Stripe
  webhooks perform that transition.
- The bind endpoint requires both the signed enrollment cookie and a verified
  Cognito access-token cookie.
- Stripe identifiers are linked to billing as `payment_method_collected`; no
  subscription is created until the existing clinical-unlock invariant passes.

## Rollback

Set `APOTH_CHECKOUT_UI_MODE=hosted` and redeploy the API/patient configuration.
No data migration is needed. Existing pending enrollments retain the UI mode
and Checkout Session they started with; new attempts use hosted Checkout.
Production custom mode additionally requires
`APOTH_ALLOW_PRODUCTION_CUSTOM_CHECKOUT=true`.
