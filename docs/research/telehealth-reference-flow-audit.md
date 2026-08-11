# Telehealth reference journey audit

Observed August 10, 2026. This audit follows one weight-management product on
each reference site from its public homepage to the first account, legal
consent, or payment boundary. It is a focused journey study rather than a
complete crawl.

## Scope and method

- Sites: [Eden](https://www.eden.health/),
  [Hims](https://www.hims.com/), and
  [Brello Health](https://www.brellohealth.com/).
- Representative products: Eden personalized GLP-1 treatments, Hims Wegovy
  Pill, and Brello compounded tirzepatide.
- Surfaces inspected: homepage, relevant catalog or product page, CTA
  destinations, and public questionnaire or purchase steps.
- Synthetic, non-identifying selections were used only to reveal public flow
  progression. No account was created, no personal information was supplied,
  no legal or medical consent was accepted, and no purchase was submitted.
- Routes, campaigns, pricing, experiments, state availability, and copy can
  change. This report records the experience observed on the date above.

## Executive conclusion

The references represent three distinct conversion models:

1. **Eden: product-led clinical funnel.** A detailed product page repeatedly
   offers the same intake CTA. The intake begins with a health goal, recent
   GLP-1 use, and BMI before reaching a medical-consent boundary.
2. **Hims: editorial product education plus guided matching.** The product page
   is highly art-directed, but its CTA enters a broader weight-loss matching
   questionnaire. Short reassurance interstitials alternate with questions
   before state and telehealth consent.
3. **Brello: storefront-first commerce.** The visitor chooses a plan and is
   asked to pay for a multi-month supply before completing an intake. A refund
   is promised if the patient is not approved.

Apoth should combine Eden's clear product-to-intake continuity, Hims' focused
one-decision-at-a-time questionnaire, and Brello's transparent plan summary.
It should not adopt Brello's payment-before-intake sequence. Apoth's product
truth requires a provider-owned clinical intake, a separate $0 payment-method
setup after intake, and explicit acceptance of the exact approved offer before
the first charge.

## 1. Eden

### Observed journey

```text
Homepage /
  -> featured "Personalized GLP-1 Treatments" card
Product /treatment/glp-1-treatments
  -> repeated "Get started" / "See if you're eligible" CTAs
Intake app /intake/weightloss/welcome?coupon=GLP60
  -> reason for seeking treatment
  -> recent GLP-1 use
  -> height and weight / BMI feedback
  -> BMI consent boundary
STOP: explicit medical/off-label acknowledgment required
```

The homepage announcement strip can also bypass product education and send the
visitor directly to the weight-loss intake. The main product card instead
creates a browse-first path through the GLP-1 detail page.

### Homepage behavior

- A broad treatment catalog is the main organizing device. Weight loss is the
  largest and most prominent category, with strength, anti-aging, hair, mood,
  and other treatments nearby.
- The global header contains a generic `Get started` action and a separate
  login action.
- The weight-loss section repeats `Get started` and `See if you're eligible`
  after proof, benefits, BMI tools, clinician profiles, FAQs, and lifestyle
  content.
- The footer provides direct treatment links, including another direct route
  to the weight-loss intake.

### GLP-1 product page

- The first viewport is a two-column ecommerce composition: a large green
  product-image field beside treatment choices, pricing, a black primary CTA,
  and detailed pricing qualifications.
- The page names compounded semaglutide and tirzepatide, then compares them
  with branded alternatives farther down the page.
- Pricing is prominent but layered: medication price and a required membership
  are described separately. The qualification text is essential to
  understanding the actual recurring cost.
- The page alternates product choice, benefits, process explanation,
  testimonials, expert proof, safety information, FAQs, and repeated CTAs.
- Every inspected `Get started` CTA on the product page led to the same
  weight-loss intake URL with a campaign parameter.

### Intake behavior

- The marketing shell disappears. The intake uses a centered, narrow column,
  Eden wordmark, back control, progress bar, large question, and full-width
  answer controls.
- The first observed question asks for the visitor's reasons for seeking
  treatment, allowing multiple selections.
- The second asks whether the visitor used a GLP-1 in the previous two months.
- The third collects height and weight, explains the BMI threshold, and gives
  immediate qualification-oriented feedback while reserving the final
  decision for a clinician.
- The observed synthetic mid-range BMI branch reached a consent screen with
  an expandable explanation of off-label use and a required acknowledgment.
  The audit stopped before that acknowledgment.

### Useful patterns for Apoth

- Product-specific pages make the CTA feel like a continuation rather than a
  context switch.
- The same primary CTA is repeated after major objection-handling sections.
- The intake strips away marketing navigation and shows progress and back
  behavior clearly.
- Qualification language explicitly preserves clinician authority.

### Patterns not to copy directly

- A generic global CTA that silently assumes weight loss will become confusing
  when more Apoth categories are real.
- Separate medication and membership prices make the true amount harder to
  parse. Apoth should show a single understandable range and later an exact
  approved offer.
- Clinical questions such as medication history and BMI calculation belong in
  Apoth's selected provider portal, not in Apoth's own precheck.

## 2. Hims

### Observed journey

```text
Homepage /
  -> Wegovy Pill product card
Product /weight-loss/wegovy-pill
  -> "Get started"
Weight-loss matching /g/i/mm-wm/your-goal
  -> weight-loss goal
  -> "1 in 8" reassurance interstitial
  -> pill / injection / provider-recommendation preference
  -> available-pill-range interstitial
  -> state selection + Terms / Telehealth Consent acknowledgment
STOP: legal consent required
```

The homepage also offers direct weight-loss quiz entry through an anchored
`Start your weight loss today` path. Product cards provide an alternative for
visitors who want to research a named treatment first.

### Homepage behavior

- The homepage is a multi-category campaign surface rather than a traditional
  directory. Weight loss receives the largest opening emphasis, followed by
  sexual health, testosterone, labs, and other verticals.
- Weight-loss entry appears in both outcome language (`Start your weight loss
  today`) and product language through a horizontally browsable GLP-1 lineup.
- Product cards show FDA-status labels, medication format, active ingredient,
  and starting price before the visitor opens a detail page.
- Long-form education, clinician credentials, scientific sources, tools, and
  dense safety qualifications are embedded into the same overall experience.

### Wegovy Pill product page

- The first viewport is visually quieter than the homepage: minimal header,
  oversized product media on the left, and product facts, CTA, safety link, and
  accordions on the right.
- The page emphasizes a single named product, but the CTA enters the general
  weight-loss matching flow rather than promising that exact medication.
- Later sections explain the mechanism, membership support, alternatives,
  comparative outcomes, administration format, dosage progression, FAQs, and
  safety sources.
- Product selection is framed as a preference that remains subject to provider
  review. This protects the difference between shopping intent and a clinical
  decision.

### Intake behavior

- Before account creation, Hims explicitly says answers are used to personalize
  the experience and are not part of the medical assessment.
- The first observed question asks how much weight the visitor wants to lose.
- A full-bleed editorial interstitial normalizes GLP-1 use before the next
  question.
- The next question asks whether the visitor prefers pills, injections, or a
  provider recommendation.
- Another interstitial confirms that relevant pill options exist.
- State selection appears next and requires agreement to Terms and Telehealth
  Consent before continuing. The audit stopped before accepting it.
- The flow uses one decision per screen, prominent continuation controls, and
  distinct editorial pauses rather than a single multi-field form.

### Useful patterns for Apoth

- A product page can honor a visitor's preference without presenting the
  preferred medication as clinically guaranteed.
- The statement separating pre-account personalization from medical assessment
  is highly relevant to Apoth's non-clinical routing precheck.
- Single-question screens reduce cognitive load and make progress feel
  deliberate.
- The product comparison answers route, format, price, and active-ingredient
  questions before asking the visitor to proceed.

### Patterns not to copy directly

- Multiple promotional interstitials add time and can feel like persuasion
  inside a sensitive questionnaire. Apoth should use at most one factual
  handoff screen and avoid unapproved prevalence or outcome claims.
- Product choice and general matching can feel disconnected when the visitor
  starts from a named medication. Apoth should carry the selected program and
  preference visibly through every non-clinical step.
- Apoth should not collect weight-loss goals or medication preferences if they
  are part of the provider's clinical questionnaire contract.

## 3. Brello Health

### Observed journey

```text
Homepage /
  -> "Explore Plans" anchor or "Let's Get Started"
Catalog /start-wellness
  -> compounded tirzepatide "Learn More"
Product /product/tirzepatide-b6
  -> three-month plan selected
  -> "Start Your Journey" / accelerated payment controls
STOP: $499 charge would occur before intake
  -> post-checkout telehealth account and intake (described, not entered)
  -> provider review
  -> shipment if approved, refund if not approved
```

### Homepage behavior

- The page is explicitly storefront-led: product and bundle cards expose
  crossed-out pricing, promotional monthly equivalents, badges, and direct
  `Learn More` links.
- The main CTA scrolls to the plan catalog; the header CTA opens a dedicated
  catalog page rather than a questionnaire.
- Trust is built through member counts, shipping estimates, pharmacy and app
  claims, Trustpilot content, testimonials, included fitness/community
  benefits, and a four-step process.
- The process is stated plainly: choose and purchase a plan, then complete the
  intake, then receive provider review, then ship or refund.

### Catalog page

- GLP-1 plans appear first, followed by individual wellness medications and
  multi-product protocols.
- Each card communicates starting monthly equivalent, minimum commitment, and
  the automatic renewal cadence before the visitor opens the product.
- The catalog is useful as a product taxonomy, but its CTA language says `See
  if you qualify` even though the actual next meaningful action is selecting a
  product and paying.

### Tirzepatide product and payment boundary

- The first viewport uses a conventional retail product detail layout: image
  gallery, product name, promotional price, included items, social proof, and
  plan confirmation.
- One three-month plan was preselected in the observed path. The page stated a
  $499 charge today and an automatic $499 renewal every 11 weeks.
- The primary purchase action sits beside accelerated wallet options.
- A prominent explanation states that no intake is required before payment;
  the intake is completed after checkout inside the telehealth account.
- The audit stopped without activating any purchase action.

### Useful patterns for Apoth

- Plan commitment, renewal cadence, included services, and today's amount are
  highly visible near the action.
- The catalog makes the relationship between individual medications and
  broader treatment protocols easy to scan.
- The process description is repeated near conversion instead of being hidden
  in an FAQ.

### Patterns not to copy directly

- Paying before intake or approval conflicts with Apoth's billing invariant.
- `See if you qualify` is misleading when the next step is actually a charge.
- Refund-after-decline transfers avoidable financial uncertainty to the
  patient. Apoth should preserve $0 before clinical approval.
- Promotional crossed-out pricing, urgency, and large outcome-heavy social
  proof require evidence and legal review that Apoth does not currently have.

## Cross-site comparison

| Dimension | Eden | Hims | Brello |
| --- | --- | --- | --- |
| Primary model | Product-led intake | Guided treatment matching | Storefront purchase |
| Homepage entry | Category card or direct intake CTA | Quiz CTA or named product card | Plan anchor or catalog page |
| Product detail | Medication family and price choices | One named product with alternatives | One compounded product and fixed commitment |
| CTA destination | Product-specific weight-loss intake | General weight-loss matcher | Purchase controls |
| First observed input | Reason for treatment | Desired weight loss | None before payment |
| Questionnaire rhythm | One question per screen | Question, editorial pause, question | Intake described as post-checkout |
| Product preference | Implied by GLP-1 route | Explicit pill/injection/provider choice | Fixed by purchased SKU |
| Location gate | Not reached in observed branch | Before legal consent | Not reached before payment |
| Account timing | Not reached before consent boundary | Not reached before consent boundary | Telehealth account described after checkout |
| Payment timing | Not reached | Not reached | Before intake and provider review |
| Clinical authority | Clinician confirms eligibility | Provider reviews intake and match | Provider approves after purchase |
| Progress treatment | Persistent top progress bar | Route-based step flow and interstitials | Retail page; no visible intake progress yet |
| Most transferable strength | Product-to-intake continuity | Focused matching and clean intake UI | Price and commitment clarity |
| Main risk for Apoth | Collecting clinical data locally | Overlong persuasive questionnaire | Charge before clinical approval |

## What the references collectively teach

### 1. There are two legitimate visitor entry modes

- **Browse first:** homepage -> product page -> begin.
- **Start now:** persistent CTA -> short routing or matching flow.

Apoth should support both without producing two different onboarding systems.
Every start action should converge on the same product-aware `/get-started`
state.

### 2. The CTA promise must match the next screen

`Learn more` should open product education. `Start precheck` should begin a
precheck. `Review and pay` should open a purchase summary. The Brello example
shows the trust cost of using qualification language for what is functionally
a purchase step.

### 3. Product intent should survive the handoff

Hims preserves format preference inside a general matching flow; Eden uses a
product-specific intake route. Apoth should carry the `weight` selection from
marketing through precheck, OTP verification, portal launch, billing, and
status. The provider still makes the clinical decision.

### 4. Focused task surfaces outperform marketing shells

Both Eden and Hims remove almost all global navigation once the visitor enters
the questionnaire. Apoth should similarly shift from **Persuade** mode to
**Operate** mode at `/get-started` or `/intake`: quiet header, clear progress,
one primary action, back behavior, and explicit exit/recovery.

### 5. Payment timing is a major differentiator

Brello asks for a substantial charge first. Apoth can make the opposite model
a trust advantage: `$0 before provider review`, `$0 when saving the payment
method`, and `charged only after approval and acceptance of the exact offer`.
That promise should be repeated wherever payment is discussed.

## Recommended Apoth journey

```text
Homepage /
  ├─ "Explore weight-loss care" -> /weight-loss
  └─ "See if online care fits" -> /get-started?product=weight

Weight-loss product /weight-loss
  ├─ product, range, inclusions, exclusions, process, safety, FAQ
  └─ "Start the $0 precheck" -> /get-started?product=weight

Program handoff /get-started?product=weight
  ├─ selected program
  ├─ realistic $99-$199 monthly range
  ├─ due now: $0
  ├─ Apoth precheck vs provider questionnaire distinction
  └─ "Start the short precheck" -> /intake?product=weight

Apoth routing /intake?product=weight
  1. Privacy-notice review and acknowledgment
  2. State and adult-age routing
  3. Emergency / online-care safety routing
  4. Email OTP account verification

Secure handoff /portal/launch
  -> provider-owned clinical questionnaire and review

After provider intake /billing
  -> Stripe payment-method setup
  -> due today: $0
  -> no subscription created

After signed clinical approval /billing/activate
  -> exact approved treatment and price
  -> explicit recurring authorization
  -> first charge and monthly subscription

Dashboard /dashboard
  -> current state, responsible party, next action, and charge status
```

## Recommended CTA map

| Surface | Primary CTA | Destination | Why |
| --- | --- | --- | --- |
| Homepage category card | Explore weight-loss care | `/weight-loss` | Browse-first visitors need product context |
| Homepage/global CTA | See if online care fits | `/get-started?product=weight` | Honest about routing rather than promising medication |
| Product hero | Start the $0 precheck | `/get-started?product=weight` | Connects action to the payment promise |
| Product-page repeated CTA | Start the short precheck | `/get-started?product=weight` | Keeps one unambiguous conversion action |
| Get-started summary | Continue to precheck | `/intake?product=weight` | The selected program, range, and sequence are already visible |
| Precheck completion | Verify email to continue | Inline OTP | Creates the passwordless account only after routing succeeds |
| Verified handoff | Continue to secure medical intake | `/portal/launch` | Names the provider-owned transition |
| Post-intake billing | Save payment method — $0 today | `/billing` -> Stripe | Makes setup distinct from a charge |
| Approved offer | Authorize exact amount and start plan | `/billing/activate` | Names the real financial consequence |

`Get started` and `See if you're eligible` currently lead to the same Apoth
destination in several places. They should not appear together as if they are
different choices. Use one primary conversion label and a genuinely different
secondary action such as `How it works` or `Compare treatments`.

## Page-level flow recommendations

### Homepage

- Keep the current browse path through the weight-loss card.
- Make the header CTA explicit about the first step rather than using a generic
  promise.
- Do not add product-category choices that are not actually launchable.
- Repeat the primary CTA after the strongest proof/process section and at the
  close, not after every short section.

### Weight-loss product page

- Preserve the strong ecommerce first viewport and transparent range.
- Add a compact comparison that explains semaglutide vs tirzepatide as possible
  provider-selected options, without allowing the visitor to purchase a
  prescription directly.
- Correct the process copy so it distinguishes Apoth's routing precheck from
  the provider portal's clinical health history and treatment questions.
- Keep `$0 before intake`, `$0 at payment-method setup`, and `exact offer after
  approval` visible beside the primary CTA.

### Get started

- The current page behaves mostly as a doorway to another doorway. Turn it into
  a concise commitment screen that earns the additional click.
- Show selected program, realistic range, what is included, lab exclusions,
  renewal timing, cancellation, compounded-medication disclosure, responsible
  parties, and the five-step sequence.
- Returning patients should resume automatically; new patients should see one
  prominent `Start precheck` action.

### Precheck

- Consider presenting the short precheck as focused steps rather than one
  visually dense form: privacy, location/age, safety routing, then verification.
- State plainly, as Hims does, that these answers route the experience and are
  not the provider's medical assessment.
- Do not collect weight, medication history, symptoms, diagnoses, goals, or
  other clinical-questionnaire answers inside Apoth.
- Include clear recovery for unsupported states, minors, emergencies, and
  cases requiring clinician review.

### Portal launch

- Keep the current explanation of the institutional boundary and $0 payment
  timing.
- Add a visible journey step such as `Step 3 of 5: Medical intake` so the vendor
  handoff feels like continuity rather than abandonment.
- Preserve a clear return/retry state when the provider launch is delayed or
  unavailable.

### Billing and approval

- Keep payment-method setup separate from offer acceptance.
- Use a receipt-like summary with `Due today: $0`, `Subscription: not started`,
  and `Next: provider decision` before opening Stripe.
- On approval, name the treatment, exact first amount, recurring amount,
  interval, cancellation rule, and first-charge consequence in the same panel
  as the authorization control.

## Current Apoth flow gaps revealed by the comparison

1. The product page's `How it works` copy currently says Apoth's first step
   collects health history and weight-loss goals, while the durable architecture
   assigns the clinical questionnaire to the provider portal. The copy should
   reflect that boundary.
2. `/get-started` does not yet carry all of the price range, inclusions,
   exclusions, renewal, and cancellation information specified by the staged
   enrollment feature contract.
3. `Get started` and `See if you're eligible` are used as parallel labels for
   the same destination, creating a false choice.
4. The `/intake` form is architecturally safer than the competitor flows, but
   its visual treatment still resembles the older Apoth form system rather
   than the adopted marketing direction.
5. Progress across Apoth, the provider portal, Stripe, and the return to Apoth
   is explained in copy but not yet expressed as one persistent patient journey.

## Recommended design principle

**Browse like ecommerce; qualify like a calm utility; hand off like one
continuous service.**

The marketing and product pages can remain expressive and product-led. The
moment the patient begins precheck, the interface should become focused and
quiet. Every screen should answer four questions without requiring the patient
to understand the integration architecture:

1. Where am I?
2. What happens next?
3. Who is responsible for this step?
4. Has any charge occurred?

