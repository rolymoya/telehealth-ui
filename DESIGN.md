---
name: Apoth Story-Mosaic Design System
description: Warm editorial healthcare commerce that moves from confident storytelling to a quiet, trustworthy clinical handoff.
colors:
  canvas: "#f9f9fa"
  paper: "#ffffff"
  ink: "#171719"
  ink-hover: "#343437"
  muted-ink: "#626266"
  hairline: "#dedee1"
  pear: "#9dcc7d"
  sun: "#f2da68"
  warm-editorial: "#f7f3ed"
  pear-soft: "#e6f0df"
  care-blue: "#4e80ee"
  error-surface: "#f5ece5"
  error-ink: "#7c3f20"
typography:
  display:
    fontFamily: "Figtree, Helvetica Neue, sans-serif"
    fontSize: "clamp(3.75rem, 7vw, 5.875rem)"
    fontWeight: 430
    lineHeight: 0.96
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Figtree, Helvetica Neue, sans-serif"
    fontSize: "clamp(2.75rem, 4.8vw, 4.25rem)"
    fontWeight: 440
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Figtree, Helvetica Neue, sans-serif"
    fontSize: "1.5625rem"
    fontWeight: 540
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Figtree, Helvetica Neue, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Figtree, Helvetica Neue, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 620
    lineHeight: 1.2
    letterSpacing: "normal"
  wordmark:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
rounded:
  focus: "8px"
  field: "14px"
  group: "16px"
  media-mobile: "20px"
  media: "24px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "72px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "46px"
  button-primary-large:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "46px"
  text-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "48px"
  navigation-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "0 32px"
    height: "74px"
  pricing-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.group}"
    padding: "20px"
  media-stage:
    backgroundColor: "{colors.pear}"
    textColor: "{colors.ink}"
    rounded: "{rounded.media}"
  progress-step-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    size: "24px"
---

# Design System: Apoth Story Mosaic

## Overview

**Creative North Star: "The Clear Care Mosaic"**

The Clear Care Mosaic pairs everyday warmth with exact healthcare boundaries. Public pages use large, lightweight Figtree headlines, cinematic full-color imagery, broad pear and warm editorial fields, and low-chrome composition to make the offer legible without making care feel transactional or clinical.

Expression intentionally recedes as a patient advances. Marketing begins inside a generous 1400px story frame; product choice becomes a focused 60/40 decision; account, payment, and portal-launch steps narrow to quiet, nearly unboxed task columns. At every stage, Apoth remains the technology, identity, and commerce layer while the independent provider portal owns the questionnaire, clinical review, clinical record, and care workflow.

**Key Characteristics:**

- Figtree for every interface and display role; Georgia only for the Apoth wordmark.
- A neutral `#f9f9fa` canvas structured by hairlines, tonal bands, and decisive image crops.
- Pear and sun fields create memorable category and action moments without becoming universal brand primaries.
- Black pill actions use direct, context-specific language and preserve honest payment timing.
- Marketing is spatial and editorial; commerce is narrow, calm, and operational.

## Colors

The palette is neutral first, with pear, sun, and warm editorial color reserved for broad storytelling fields and clear state transitions.

### Primary

- **Clear Ink** (`#171719`): Primary text, dark process bands, active progress steps, and black pill actions.
- **Product Pear** (`#9dcc7d`): The signature weight-care media stage and primary category field.

### Secondary

- **Quiet Sun** (`#f2da68`): Announcement strips and closing action bands.
- **Warm Editorial** (`#f7f3ed`): Human-care stories and broad editorial sections.
- **Soft Pear** (`#e6f0df`): Ownership and care-boundary explanation bands.
- **Care Blue** (`#4e80ee`): Focused field states and limited utility feedback, never a marketing wash.

### Neutral

- **Open Canvas** (`#f9f9fa`): The default page and navigation surface.
- **Paper** (`#ffffff`): Grouped decisions, secondary actions, and header/footer separation.
- **Soft Ink** (`#626266`): Supporting copy and secondary labels.
- **Hairline** (`#dedee1`): Rows, strips, disclosure lists, and structural dividers.
- **Hover Ink** (`#343437`): The restrained hover state for black actions.

### Named Rules

**The Accent Field Rule.** Pear, sun, and warm editorial colors earn attention through broad fields; do not scatter them across badges, icon bubbles, or decorative fragments.

**The Boundary Color Rule.** Error and status colors communicate operational state only. Never use color to imply clinical eligibility, approval, or treatment outcome.

## Typography

**Display Font:** Figtree (with Helvetica Neue and sans-serif fallbacks)

**Body Font:** Figtree (with Helvetica Neue and sans-serif fallbacks)

**Wordmark Font:** Georgia (with Times New Roman and serif fallbacks)

**Character:** Figtree is used across headlines, body copy, controls, pricing, and task UI. Displays are large, moderately weighted, tightly tracked, and lightweight enough to feel editorial rather than promotional; the only serif is the compact, familiar Apoth wordmark.

### Hierarchy

- **Display** (430, `clamp(60px, 7vw, 94px)`, `0.96`): Homepage outcome statements; use balanced wrapping and a wide measure.
- **Headline** (440, `clamp(44px, 4.8vw, 68px)`, `0.98`): Section openings and product narratives.
- **Task Display** (460, `clamp(40.8px, 6vw, 62.4px)`, `0.98`): Quiet commerce and portal-launch headings.
- **Title** (520–540, 18–27px, `1.08`): Story cards, offer rows, and step headings.
- **Body** (400, 16px, `1.55`): Plain-language explanation; keep reading measures around 65ch.
- **Label** (560–650, 12–14px): Navigation, actions, price metadata, and compact operational status.

### Named Rules

**The One Serif Rule.** Georgia belongs to the lowercase Apoth wordmark only; do not use serif type for editorial headlines, quotes, product names, or decorative accents.

## Layout

Marketing pages use a centered frame up to 1400px wide with 32px desktop gutters and 16–20px mobile gutters. The homepage first viewport pairs a broad headline and proof list above a roughly 66/34 story mosaic with a 16px gap: a large pear product stage and a narrower warm human story. Hairline-separated strips bridge major bands, and full-width editorial sections alternate between light fields and the dark process band.

The weight-care page uses an approximately 60/40 media-to-decision split. Its 24px pear media stage may remain sticky on desktop while the offer, pricing, inclusion, and safety content stays in one grouped decision column. Supporting treatment options are horizontal rows, not repeated floating cards.

At 1020–1024px, primary navigation hides, the mosaic and product hero collapse to one column, and proof points may briefly share a three-column strip. At 760px and below, layouts become single-column, media corners reduce to 20px, gutters tighten, all controls remain at least 44px tall, and the weight-care surface gains a persistent bottom CTA above the safe-area inset. Commerce and portal handoff use centered 760px task columns with a 1180px shell header; content is separated by hairlines rather than nested panels.

**The Progressive Quieting Rule.** Each step toward clinical intake removes visual chrome: mosaic, then product decision, then receipt-like account flow, then a nearly unboxed portal launch.

## Elevation & Depth

The system is flat by default. Depth comes from full-bleed tonal changes, image scale, sticky positioning, and one-pixel dividers; broad marketing sections, FAQs, care rows, and portal steps sit directly on their field. Restrained ambient shadow is reserved for the grouped pricing decision, menus or overlays, and isolated product-object staging—not for every container.

### Shadow Vocabulary

- **Decision Panel** (`box-shadow: 0 18px 50px rgba(23, 23, 25, 0.07)`): The single white pricing panel on the product hero.
- **Quiet Overlay** (`box-shadow: 0 12px 40px rgba(20, 24, 22, 0.08)`): Menus and temporary elevated surfaces only.
- **Product Object** (`filter: drop-shadow(0 17px 16px rgba(40, 60, 43, 0.14))`): Isolated vial or injector imagery, never a content card.
- **Focus Ring** (`box-shadow: 0 0 0 2px #f9f9fa, 0 0 0 4px rgba(24, 24, 26, 0.75)`): High-contrast keyboard focus on non-field controls.

**The Surface Discipline Rule.** If a hairline or background transition establishes structure, do not add a shadow.

## Shapes

The shape language combines editorial rectangles with soft media corners and fully pill-shaped actions. Large image stages use 24px corners on desktop and 20px on mobile; grouped pricing and task rows use 14–16px corners; global patient panels may reach 22px only when they are true bounded tasks. Buttons use a `999px` pill, and numbered steps use compact circles. Hairlines remain square and uninterrupted so lists and strips read as one system rather than a pile of cards.

## Components

### Buttons

- **Primary:** Clear Ink fill, white label, 46px minimum height on marketing surfaces and 52–56px for primary product or commerce actions; use a `999px` radius.
- **Secondary:** White fill with a quiet ink border; reserve it for login and other subordinate actions.
- **Hover / Focus:** Shift black fills to `#343437` and translate up by at most 1px; use the neutral focus ring and remove the lift under reduced motion.
- **CTA grammar:** Use “See if online care fits” for exploratory marketing, “Start the $0 precheck” for the weight-care decision, and “Continue to medical intake” for the portal handoff. Do not collapse these stages into one vague action or imply that starting creates a charge.

### Navigation

The 36px sun announcement sits above a sticky, lightly translucent canvas header. The desktop header is 74px tall inside the 1400px frame; mobile is 62px. Keep the Georgia wordmark left, quiet Figtree links centered, and black action plus login at right. Mobile navigation hands the primary action to a menu, while the product page also preserves a fixed 52px action at the bottom.

### Story Mosaic and Treatment Strip

The signature mosaic uses a 24px pear product stage beside a 24px warm human-care story. Copy stays anchored inside the media field and imagery receives a decisive crop; the only large motion is a subtle `1.025` product-image scale over 900ms. Below it, three care lanes use top, bottom, and inter-lane hairlines with no card shadow.

### Pricing and Offer Rows

Keep pricing in one white 16px panel with a restrained ambient shadow. Use 72px hairline-separated rows, align exact prices to the edge, put the full-width 52px CTA after the options, and keep `$0` timing and approval language visible as microcopy. Treatment comparisons below the hero remain unboxed horizontal rows with 16px product-image fields.

### Inputs and Status

Fields are white, at least 48px tall, and 14px rounded. Hover strengthens the neutral border; focus uses Care Blue with a three-pixel translucent halo. Errors use a warm, low-saturation surface with icon, title, recovery copy, and a real next action; status styling must never reveal or solicit clinical questionnaire content.

### FAQ and Process Rows

FAQs are transparent disclosure rows separated by hairlines, with a 28px circular plus control and no resting shadow. Process bands invert to Clear Ink with white type, restrained translucent dividers, and 27–28px numbered circles. Motion is limited to the disclosure icon rotation and one orchestrated reveal; all information remains visible with reduced motion.

### Commerce and Portal Handoff

Commerce uses a white shell header, a five-step hairline progress strip, and a centered task column no wider than 760px. Portal launch is nearly unboxed: ownership status, one large Figtree heading, payment-timing copy between hairlines, a full-width 56px black action, and an ordered “What happens next” list. Keep Apoth’s role, the independent provider’s role, and the secure external launch explicit without rendering or persisting clinical answers.

## Do's and Don'ts

### Do:

- Do use self-hosted Figtree for every interface and display role, with Georgia reserved for the Apoth wordmark.
- Do compose marketing inside the 1400px editorial frame and preserve the roughly 66/34 first-viewport story mosaic.
- Do use full-color product and lifestyle imagery with decisive crops and 16–24px media corners.
- Do let hairlines, broad tonal fields, and the dark process band establish hierarchy before introducing elevation.
- Do keep mobile controls at least 44px tall and preserve the persistent weight-care CTA above the safe-area inset.
- Do state `$0` timing, separate offer acceptance, and institutional ownership beside the action they qualify.

### Don't:

- Don't substitute a legacy sans-serif, unrelated display face, or serif editorial accent for the Figtree system.
- Don't reference an external visual-source repository or treat a prior implementation as the design authority.
- Don't turn hairline lists, FAQs, treatment rows, or portal steps into repeated floating cards.
- Don't add universal card sheen, lift, decorative gradients, or strong resting shadows.
- Don't replace the stage-specific action language with a vague catch-all label.
- Don't imply Apoth provides medical care, owns the clinical questionnaire or record, guarantees treatment, or begins billing before approval and separate offer acceptance.
