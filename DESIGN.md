<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: Telehealth UI
description: Marketing surface for a patient-facing telehealth service in the warm-modern wellness lane.
---

# Design System: Telehealth UI

## 1. Overview

**Creative North Star: "The Editorial Apothecary"**

A patient-facing telehealth marketing surface that reads like a thoughtfully made print object pulled into a quiet consult room. Warmth comes from a committed clay surface that carries 30 to 60% of any given screen, paired with a soft sage as its supporting tone and a bone-cream as the neutral. Authority comes from editorial restraint: a transitional or contemporary serif on hero and headline, a humanist sans for everything that does the working.

The system explicitly rejects the category's two failure modes. It is not a clinical portal (no clinical blue, no institutional navy, no beige forms, no regulatory voice). It is not generic health-tech SaaS (no gradient hero blob, no three-up feature card grid, no cartoon doctor illustrations, no "AI-powered" copy). The reference triangle is Hims for permission to be warm and confident in healthcare, Aesop for restrained apothecary craft and clay/sage palette literacy, Cereal Magazine for editorial typography and unhurried spacing.

The voice is warm, candid, modern: a knowledgeable friend who happens to work in healthcare. Trust is earned through specifics (named clinicians, transparent pricing, real timelines), not badges or "trusted by millions" copy.

**Key Characteristics:**
- Committed clay surface as the brand's primary visual move; the color does load-bearing work
- Serif headline + humanist sans body pairing; reads "made", not templated
- Restrained motion that lives between state-change minimalism and light transitional feedback
- Patient-leaning legibility defaults: comfortable body type sizes, generous tap targets, AA contrast
- Real over stock: photography and detail sourced from the actual service, never illustrated avatars

## 2. Colors

A warm, earth-tonal palette anchored on a committed clay primary, with sage as a quieter supporting tone and bone-cream as the neutral surface. No clinical blue, anywhere.

### Primary
- **Warm Clay** (`oklch(58% 0.115 38)` — scale: deep `oklch(46% 0.13 36)`, soft `oklch(72% 0.07 40)`, tint `oklch(92% 0.025 50)`): the brand's load-bearing color. Used as committed surface treatment on hero and section blocks, on the primary CTA, and as the strong text accent in editorial pull quotes. Carries 30 to 60% of any given screen.

### Secondary
- **Soft Sage** (`oklch(76% 0.045 145)` — scale: deep `oklch(40% 0.06 145)`, soft `oklch(88% 0.03 145)`): the supporting tone. Used on calmer surfaces (testimonials, trust strip, secondary cards) and as a quiet accent in iconography. Never used at full saturation; never paired with the clay at equal weight. Sage is the second voice, never the lead.

### Neutral
- **Bone Cream** (`oklch(97% 0.008 75)` — scale: warm `oklch(94% 0.012 70)`, deep `oklch(91% 0.014 65)`): the default page surface and the resting background outside the clay sections. Tinted toward the brand hue; never pure `#fff`.
- **Stone Ink** (`oklch(20% 0.008 40)` — scale: soft `oklch(35% 0.008 40)`): default body text. Tinted toward warm; never pure `#000`.
- **Ash Mid** (`oklch(58% 0.008 40)` — scale: line `oklch(82% 0.008 40)`): meta text, captions, supporting labels. Used sparingly, AA-validated against bone-cream.

### Named Rules

**The Committed Clay Rule.** The warm clay anchors the page; it must carry 30 to 60% of the visual surface, never less. A clay accent of 5% on an otherwise neutral page reads as restraint, not commitment, and undermines the brand stance. If a screen feels neutral-by-default with a small clay button, the clay is in the wrong role.

**The Two-Voice Rule.** Clay leads, sage supports. They are never given equal weight. Sage may quiet a section, frame a testimonial, tint an icon set; sage may not headline.

**The No Clinical Blue Rule.** No blue, period. The color slot it would occupy is occupied by clay or sage. There is no third hue waiting to enter the palette.

## 3. Typography

**Display Font:** Fraunces — a contemporary variable serif with optical size axis (`opsz`) and expressive weight range. Loaded via `next/font/google`, weights 300–500, CSS var `--font-display`. Tailwind: `font-display`.
**Body Font:** Inter — a humanist sans with excellent legibility at small sizes. Loaded via `next/font/google`, weights 400–600, CSS var `--font-sans`. Tailwind: `font-sans`.

**Character:** A deliberately editorial pairing. The serif on hero and headline does the "made" signal; the humanist sans on body keeps reading effortless for a mixed-literacy patient audience. The contrast between the two is the system's signature move.

### Hierarchy
- **Display** (serif, weight 300-400, `clamp(2.75rem, 7vw, 5rem)`, line-height ~1.0-1.05): hero headline and major section titles only. Tight tracking; tight leading; never stacked more than one Display per surface.
- **Headline** (serif, weight 400, ~2rem-2.5rem, line-height 1.15): secondary section titles and feature lead-ins.
- **Title** (sans, weight 500, ~1.25rem, line-height 1.3): card titles, list-section labels.
- **Body** (sans, weight 400, 17-18px on key reading surfaces, line-height 1.55-1.65, max line length 65-75ch): all primary reading copy. The 16px floor is a floor, not a target.
- **Label** (sans, weight 500, 12-13px, letter-spacing +2-4%, sentence case): meta labels, eyebrow text, form field labels. Avoid all-caps blocks longer than two or three words.

### Named Rules

**The Serif-Lead Rule.** The display lane is always serif. The sans never crosses into headline territory. If a hero looks balanced in sans-only, the hero is missing its strongest move.

**The Patient Floor Rule.** Body type never drops below 16px and targets 17-18px on long-form reading surfaces. The audience is mixed-literacy adults, often on phones outside good light; small type is a trust failure, not a sophistication signal.

**The No All-Caps Paragraphs Rule.** All-caps is reserved for short labels and eyebrows. Sentence case for everything that has to be read.

## 4. Elevation

The system is flat by default with depth conveyed through tonal layering. Bone-cream is the resting surface; clay sections sit at the same plane visually but read as foreground because of saturation. Sage panels sit between, used to demarcate testimonial or trust regions without introducing shadow.

Shadows appear only as a response to state (hover on an interactive surface, focus on an input). They are never used to make a card "lift" decoratively. No glassmorphism, no backdrop blur as a default.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Depth comes from clay-vs-cream-vs-sage tonal layering, not from drop-shadow. If a surface needs a shadow to read as a surface, the structure is wrong.

**The State-Only Shadow Rule.** Shadows belong to states (hover, focus), not to resting elements. A card that has a shadow before the cursor arrives is a card that has nothing to say when it is touched.

## 5. Components

`[Component primitives to be defined when implementation begins. Re-run /impeccable document once buttons, inputs, navigation, and cards exist in code.]`

## 6. Do's and Don'ts

### Do:
- **Do** anchor the page with warm clay covering 30 to 60% of the visual surface. Below that, the brand has not committed.
- **Do** lead with a serif display on hero and major section titles. The sans never crosses into headline territory.
- **Do** size body type at 17-18px on key reading surfaces, with a 16px floor and a 65-75ch max line length.
- **Do** use sage as a quiet supporting tone for testimonial regions, trust strips, and icon tinting.
- **Do** earn trust through specifics: named clinicians, real prices, real wait times, real conditions.
- **Do** keep one clear primary action per surface; secondary actions are quieter (text link, ghost button), never competitive.
- **Do** respect `prefers-reduced-motion`; ship a reduced-motion variant of any transition longer than a state-change.
- **Do** validate every type and color pairing against WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI affordances).

### Don't:
- **Don't** use clinical blue. There is no version of this system that reads with a primary blue. Anti-reference: GoodRx, Doctor on Demand, Teladoc.
- **Don't** ship a "generic health-tech SaaS" landing page: gradient hero blob, three-up feature cards, pastel illustrations of doctors with stethoscopes, "AI-powered" headline. Anti-reference: GoodRx and the broader category template.
- **Don't** style anything like a hospital portal: beige forms, navy headers, dense regulatory disclosure. Anti-reference: MyChart, Epic, hospital homepages.
- **Don't** style anything like corporate pharma: navy-and-white, suit-and-handshake stock, press-release voice. Anti-reference: Pfizer, Merck.
- **Don't** ship shouty DTC: neon CTAs, urgency banners, countdown timers, "limited time!" copy. Warmth is the move; pressure is not.
- **Don't** use cartoon doctor illustrations or generic "doctor with tablet" stock photography. Real photography sourced from the actual service, or no image.
- **Don't** use gradient text (`background-clip: text` over a gradient). One solid color, weight contrast for emphasis.
- **Don't** use side-stripe borders (a colored `border-left` or `border-right` greater than 1px) on cards, callouts, or alerts.
- **Don't** lean on glassmorphism or backdrop blur as a default. Rare and purposeful, or nothing.
- **Don't** ship the hero-metric template: big number, small label, supporting stats, gradient accent. SaaS cliché.
- **Don't** ship identical card grids: same-sized cards with icon + heading + text repeated endlessly.
- **Don't** use modals as a first thought. Exhaust inline and progressive alternatives first.
- **Don't** use em dashes (` — `) or double-hyphens (`--`) in body copy. Commas, colons, semicolons, periods, parentheses.
- **Don't** wrap everything in a container or use the same padding everywhere. Vary spacing for rhythm.
