# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The launch audience is adults considering or returning to clinician-guided
weight-loss care. They browse on phones and laptops, often outside a clinical
setting, with mixed health and technical literacy. Some are cautious about
online medicine or have had poor experiences with clinical portals. They need
to understand whether the service fits them, what it costs, when payment can
occur, how quickly care can begin, and who is responsible for each part of the
experience.

After signup, the same patient needs a quiet account surface for verifying
their identity, understanding enrollment and billing status, and securely
entering the selected white-label clinical portal without feeling abandoned at
a vendor handoff.

## Product Purpose

Apoth is the patient-facing technology and commerce layer for weight-loss
telehealth. It helps a visitor choose to begin, review privacy, complete a
short non-clinical precheck, create a passwordless account through Amazon
Cognito, and enter an independent provider's white-label clinical portal.
After clinical intake, Apoth coordinates $0-due payment-method setup and, only
after approval, a separate acceptance of the exact recurring treatment offer.

Success means a visitor can understand the offer and start enrollment in under
a minute; patients always know their current step, next action, responsible
party, and charge status; and Apoth completes the handoff without becoming a
second clinical record.

## Positioning

Apoth provides a coherent, self-service weight-loss journey while remaining a
deliberately thin orchestration layer. It joins marketing, identity, consent,
payment-method setup, billing status, and secure portal launch without
collecting the clinical questionnaire or presenting Apoth as the medical
provider. Payment setup is separated from billing activation: the patient is
not charged before the independent clinical provider approves care.

## Operating Context

The patient journey begins on the public marketing site, primarily at `/` or
`/weight-loss`, and enters enrollment at `/get-started?product=weight`. Privacy
acknowledgement and the bounded precheck happen before passwordless email-code
account verification through Cognito. The verified patient then uses an
authenticated, single-use launch into the selected clinical portal. Hosted
Stripe Checkout is used later to save a payment method with $0 due; it does not
start billing. Clinical approval produces an exact treatment offer that the
patient must separately accept before the first charge or subscription.

The clinical portal owns eligibility questions, intake, clinician review, the
clinical record, and care workflow. Apoth owns the framing around identity,
commerce, status, and the handoff. Stripe owns payment instruments and billing
artifacts. A separate 503A compounding pharmacy partner owns fulfillment.
Patients should not need to understand the integration architecture, but they
must never be misled about which entity provides care, charges them, or
dispenses medication.

The repository still contains MDI intake and workflow routes while migration is
underway. MD Integrations is a legacy adapter, not the target patient
experience or the durable product boundary.

## Capabilities and Constraints

- Apoth Health LLC, an Illinois company, is a technology platform. It does not
  practice medicine, prescribe, make clinical decisions, or dispense
  medication.
- The selected white-label portal provider is still undecided. Its approved
  compliance and BAA path is a launch dependency.
- Apoth must not render or persist clinical questionnaire answers. The clinical
  portal is the clinical system of record.
- Amazon Cognito owns patient identity and passwordless email-code
  verification. DynamoDB stores only minimal account, consent, status, billing,
  and opaque provider-linkage records.
- Stripe Checkout collects a payment method in setup mode after clinical
  intake. Due at setup is $0. No charge or subscription may be activated before
  clinical approval and separate acceptance of the exact offer. Stripe metadata
  may contain only opaque, non-PHI identifiers because Stripe is not BAA-eligible.
- Portal access must be authenticated, short-lived, and single-use. Clinical
  state comes from signed provider events or short-lived launches rather than a
  local copy of the clinical workflow.
- Reliable event handling uses AWS serverless services, including Lambda,
  DynamoDB idempotency, and SQS/DLQ where durable retry is required.
- The launch architecture excludes Persona/KYC, RDS/Postgres, Redis, always-on
  workers, App Runner, NAT gateways, and VPC endpoints unless a future product
  or architecture decision reopens their need.
- Compounded medications require clear not-FDA-approved disclosure and a
  distinction from brand-name products. Public legal copy remains subject to
  healthcare-counsel and LegitScript review.
- The pharmacy partner's name and the target white-label clinical portal
  provider remain open decisions.

## Brand Commitments

The product name is Apoth. Its voice is warm, candid, modern, and
plain-spoken: a knowledgeable guide rather than a hospital, pharmaceutical
company, or wellness influencer. Trust should come from concrete, reviewable
facts and honest boundaries, including what Apoth does not do. Copy must avoid
pressure tactics, invented reassurance, and any implication that Apoth
provides medical care.

## Evidence on Hand

- Implemented public product surfaces at `/` and `/weight-loss`, with current
  offer, pricing, process, safety, and disclosure copy in `src/app` and
  `src/lib/data.ts`.
- Implemented enrollment, account, billing, and portal-launch behavior in
  `src/app`, `src/patient`, and `src/lib/enrollment`, with invariants covered by
  unit and end-to-end tests.
- Product and lifestyle image assets under `public/images`, including weight-
  loss hero, vial, syringe, and lifestyle imagery.
- Architecture, data-boundary, billing, and compliance evidence in `docs`,
  `RULES.md`, and `AGENTS.md`.
- No verified clinician profiles, testimonials, measured outcomes, named
  pharmacy partner, or other clinical proof are approved for use at this time.
  Future work must not fabricate them.

## Product Principles

1. **Make the next step unmistakable.** A patient should always understand
   where they are, what happens next, and whether any charge has occurred.
2. **Keep institutional boundaries honest.** Apoth, the independent clinical
   provider, Stripe, and the pharmacy partner have distinct responsibilities
   that the product must not blur.
3. **Stay thin by design.** Collect and retain only what Apoth needs for
   identity, commerce, status, consent evidence, and secure portal linkage.
4. **Earn trust with specifics.** Use confirmed prices, timing, policies, and
   ownership facts; label open decisions and never invent proof.
5. **Design for reliable handoffs.** Enrollment, verification, provider launch,
   webhooks, and billing transitions must be idempotent, recoverable, and clear
   to the patient when delayed.

## Accessibility & Inclusion

Public and authenticated web surfaces target WCAG 2.2 AA. The product must
support full keyboard navigation, visible focus states, reduced-motion
preferences, semantic structure, accessible form labeling, and information
that is not conveyed by color alone. Given mixed health and technical literacy,
patient-facing language should remain plain, controls should be comfortably
touchable, and key reading surfaces should not assume high clinical literacy.
