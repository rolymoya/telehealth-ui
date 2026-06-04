# Product

## Register

brand

## Users

Adults considering or returning to telehealth care, browsing on phones and laptops, often outside of a clinical setting (kitchen table, commute, bed). Mixed health and tech literacy; some are cautious about online medicine, some have been burned by clinical portals or pharma-feeling sites. They arrive wondering "is this for me, can I trust it, what does it actually cost, how soon can I be seen." The job is decide-and-act: understand the offering in under a minute, and either start intake or leave with a clear next step.

After signup, the same patient needs a quiet account surface for finishing intake, checking case status, managing billing, and reaching the MDI-backed care workflow without feeling dropped into an institutional portal.

## Product Purpose

A patient-facing telehealth surface that helps patients self-serve their way into care. It starts as a marketing and conversion surface, then becomes a lightweight account dashboard for onboarding, case status, billing, and MDI-backed care access.

Success looks like: visitors describe the brand as "warm and clear" rather than "medical" or "salesy", intake starts on the home page rather than buried three clicks deep, and trust signals (clinicians, pricing, safety) are visible without feeling like a compliance disclosure. Logged-in patients should always know what step they are in, what Apoth owns, what MD Integrations owns, what happens next, and whether they have been charged.

## Product Boundary

Apoth owns the technology and commercial layer:

- public marketing and legal pages
- patient account identity through Cognito
- intake UI for MDI-provided questions
- submission of patient and case data to MD Integrations
- minimal app records that link Cognito, MDI, and Stripe IDs
- Stripe payment method capture, subscription/billing orchestration, and billing portal access
- dashboard framing for status, next steps, and MDI-backed workflow access

Apoth does not practice medicine, prescribe, dispense medication, or act as the clinical chart. MD Integrations is the clinical system of record. The pharmacy partner handles medication fulfillment. Apoth should not persist questionnaire answers after submission to MDI unless a future legal and architecture decision changes that posture.

## Brand Personality

Warm, candid, modern. The voice is a knowledgeable friend who happens to work in healthcare, not a hospital and not an influencer. Plain-spoken with real specificity (named conditions, real prices, real wait times) rather than soft-focus wellness language. Confident enough to say what we don't do. Emotional goals: relief, recognition ("oh, this is for someone like me"), and the small private satisfaction of having handled something.

## Anti-references

- **Hospital and EHR portals** (MyChart, Epic-styled patient sites, hospital homepages). Clinical-blue, institutional, dense, beige forms.
- **Generic health-tech SaaS templates.** Gradient hero blobs, three-up feature cards, pastel illustrations of smiling doctors with stethoscopes, "AI-powered" buzzwords.
- **Corporate pharma / medical conglomerate** (Pfizer/Merck-style sites). Navy-and-white, suit-and-handshake photography, regulatory tone, press-release voice.
- **Shouty DTC wellness.** Neon CTAs, countdown banners, "limited time!", influencer testimonials wallpapered everywhere, hard-sell urgency.

## Design Principles

1. **Plain-spoken over clinical.** Write like a person who understands medicine, not a portal that documents it. If it sounds like a consent form or a brochure, rewrite it.
2. **Calm confidence, not loud reassurance.** Trust comes from specifics (named clinicians, transparent pricing, real timelines), not badges, ribbons, or "trusted by millions."
3. **Real over stock.** Photography, names, and details should feel sourced from the actual service. No generic doctors-with-tablets imagery, no illustrated avatars filling space.
4. **One clear action per surface.** Every page knows what it wants the visitor to do next. Decoration that competes with that action is decoration we cut.
5. **Made, not templated.** The marks of craft (typography decisions, considered spacing, intentional motion) are the proof that the care behind the product is also considered. Looking made is a trust signal.
6. **System of record clarity.** Patients should understand when they are interacting with Apoth, MD Integrations, Stripe, or the pharmacy partner. The UI should hide unnecessary integration complexity, but never blur who provides clinical care or who charges the patient.
7. **Thin by design.** Do not collect, duplicate, or display clinical data just because an API makes it available. Pull the minimum needed to guide the patient through the current step.

## Accessibility & Inclusion

WCAG 2.2 AA across the marketing surface. Specific commitments:

- 4.5:1 minimum contrast for body text, 3:1 for large text and UI affordances, validated against the OKLCH palette in DESIGN.md.
- Full keyboard navigation with visible, brand-aligned focus rings (not browser default outlines, but not invisible either).
- Reduced-motion variants for any scroll-driven or transition-heavy effect; respect `prefers-reduced-motion`.
- Color-blind-safe palette: information never carried by color alone (icons, labels, or shape paired with hue).
- Semantic HTML and ARIA labeling on form fields, navigation, and any custom interactive components; tested with VoiceOver and NVDA on the booking entry points.
- Patient-leaning defaults given a mixed-literacy audience: comfortable body type size (16px floor, target 17–18px on key reading surfaces), generous tap targets, plain-language labels with disclosure for clinical detail rather than the reverse.
