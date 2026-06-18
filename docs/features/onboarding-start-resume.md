# Onboarding Start And Resume

T-018 turns `/get-started` into the launch start/resume entrypoint for signed-in
patients.

## Route Behavior

- Signed-out users are sent to `/sign-in?returnTo=/get-started`.
- Signed-in users are verified through Cognito.
- A missing minimal patient profile is created with `profile_pending`.
- If another request creates the profile first, the start helper re-reads it
  and continues.
- The user is redirected to the earliest incomplete onboarding step from the
  DynamoDB gate snapshot.

## Stored Data

The start route may create only the patient profile/status record. It does not
create MDI cases, Stripe customers, subscriptions, payment methods, billing
activation records, Persona/KYC records, or questionnaire-answer records.

## Billing Lockout

The billing step is reachable only after onboarding status is explicitly
`billing_ready`. Payment activation, charges, subscriptions, and billing side
effects remain locked to the selected MDI approval/billing-unlock event.

## Non-Goals

T-093 owns consent acceptance controls. T-021 owns residency and eligibility
inputs. T-022 owns MDI-backed questionnaire rendering and submission. The route
shells may show patient-safe placeholder copy with visible TODO markers, but
they do not implement those feature UIs in this ticket.
