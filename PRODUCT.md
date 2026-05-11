# Product

## Register

brand

## Users

Adults considering or returning to telehealth care, browsing on phones and laptops, often outside of a clinical setting (kitchen table, commute, bed). Mixed health and tech literacy; some are cautious about online medicine, some have been burned by clinical portals or pharma-feeling sites. They arrive wondering "is this for me, can I trust it, what does it actually cost, how soon can I be seen." The job is decide-and-act: understand the offering in under a minute, and either book a visit or leave with a clear next step.

## Product Purpose

A marketing surface for a telehealth service that helps patients self-serve their way into care. It exists to convert curiosity into a booked visit, and to set expectations for the in-product experience that follows. Success looks like: visitors describe the brand as "warm and clear" rather than "medical" or "salesy", booking starts on the home page rather than buried three clicks deep, and trust signals (clinicians, pricing, safety) are visible without feeling like a compliance disclosure.

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

## Accessibility & Inclusion

WCAG 2.2 AA across the marketing surface. Specific commitments:

- 4.5:1 minimum contrast for body text, 3:1 for large text and UI affordances, validated against the OKLCH palette in DESIGN.md.
- Full keyboard navigation with visible, brand-aligned focus rings (not browser default outlines, but not invisible either).
- Reduced-motion variants for any scroll-driven or transition-heavy effect; respect `prefers-reduced-motion`.
- Color-blind-safe palette: information never carried by color alone (icons, labels, or shape paired with hue).
- Semantic HTML and ARIA labeling on form fields, navigation, and any custom interactive components; tested with VoiceOver and NVDA on the booking entry points.
- Patient-leaning defaults given a mixed-literacy audience: comfortable body type size (16px floor, target 17–18px on key reading surfaces), generous tap targets, plain-language labels with disclosure for clinical detail rather than the reverse.
