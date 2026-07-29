---
name: Apoth design direction
description: Reference-led visual system for Apoth marketing and patient-facing product surfaces.
status: adopted
updated: 2026-07-27
---

# Apoth Design Direction

## North star

**Everyday Care, Studio Clear**

Apoth should feel direct, approachable, and visually confident. The public experience combines crisp retail composition with the reassurance and plain language expected from a healthcare service. It should feel easy to enter without looking casual about care.

The canonical visual reference for the current marketing direction is the implementation in `/Users/roly/git/apoth-ui-v2`. The reference is a design source, not a runtime dependency. Ports must preserve its fonts, colors, spacing, imagery treatment, radii, shadows, and motion unless a documented product, accessibility, or compliance requirement demands a change.

This replaces the former clay-led, serif-first "Editorial Apothecary" direction. Do not recolor the reference into that older system.

## Experience principles

- Lead with a clear patient outcome and one obvious next action.
- Use generous whitespace and large type, but keep the composition compact enough to feel useful.
- Pair neutral structure with distinct category colors. Color is part of the navigation and product storytelling.
- Use concrete pricing, timing, shipping, and process details to build trust.
- Keep medical and legal qualifications visible without letting them dominate the first impression.
- Preserve the distinction between Apoth Health LLC as the technology platform and independent clinical and pharmacy partners.

## Color system

The marketing palette is reference-specific. Do not replace these colors with legacy clay, sage, cream, or warm-ink tokens.

### Core colors

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#f9f9fa` | Landing page, navigation, neutral breathing room |
| Paper | `#ffffff` | Cards, panels, product detail surfaces |
| Ink | `#171719` | Primary text and dark controls |
| Soft ink | `#46474b` to `#727377` | Secondary copy, labels, supporting details |
| Cloud | `#f0f0f2`, `#ededf0`, `#f2f2f4` | Section bands and product-page backgrounds |
| Utility blue | `#4e80ee` | Shipping banner and supporting branded moments |
| Sun yellow | `#f5df75` | Landing-page closing call to action |
| Trust sage | `#e8f2e9` | Trust and benefit strip |
| Journey mint | `#e2f1eb` | Weight-loss journey section |
| Product pear | `#9dcc7d` | Weight-loss product hero image field |
| Treatment blue | `#4ba4d6` | Featured medication card |

### Treatment gradient

The featured weight-loss card uses a clay-red studio gradient, not a flat brand surface:

- Deep: `#63251b`
- Mid: `#a53f2b`
- Highlight: `#d98a6f`

The product-page start panel uses `#4e80ee` through `#79b8e1`. These gradients belong to illustration and product storytelling. Do not use gradient-filled text.

### Color behavior

- Black pill controls are the default primary action.
- Blue, yellow, pear, mint, and clay-red are intentional category and section colors. None is a universal brand primary.
- Full-color photography and product imagery are required. Do not apply global grayscale, sepia, or tint filters.
- Text and controls must continue to meet WCAG 2.2 AA contrast requirements.

## Typography

### Marketing and product pages

- **Primary face:** Arial with Helvetica and generic sans-serif fallbacks.
- **Wordmark:** Georgia or Times New Roman, bold, with tight negative tracking.
- **How it works display:** Apoth Care variable face, matching the reference product page.

Headlines are predominantly bold sans serif with tight tracking and compact line height. This is a deliberate change from the former serif-led direction. Serif is reserved for the Apoth wordmark and intentional editorial accents already present in the reference.

The current Apoth Care font is loaded from the reference stylesheet source. Before production launch, confirm licensing and self-host the approved font file so the page does not depend on a third-party font host.

### Type hierarchy

- **Hero display:** 42px mobile to 64px desktop, normal or heavy weight according to the reference composition, approximately `0.96` line height and `-0.055em` tracking.
- **Section display:** 36px to 64px, bold, tightly tracked.
- **Card title:** 16px to 28px, medium to bold, compact leading.
- **Body:** 16px by default; 18px to 21px for lead copy.
- **Navigation and controls:** 13px to 14px, semibold or bold.
- **Eyebrow and legal metadata:** 11px to 13px, uppercase only when short.

Long-form legal and account pages may retain the existing Inter and Fraunces implementation until they are deliberately migrated. New marketing work should not use those legacy faces by default.

## Layout and composition

### Landing page

The landing page uses an announcement strip, compact sticky navigation, a large outcome-led hero, an asymmetric treatment grid, trust marquee, broad editorial bands, FAQ cards, and a high-contrast yellow closing call to action.

Cards should vary in scale and purpose. Avoid a generic repeated three-column feature grid. Large imagery should be cropped confidently and allowed to carry significant visual weight.

### Weight-loss product page

The product page uses a two-column purchase hero on desktop with a sticky visual panel, followed by benefit, comparison, treatment, journey, process, social-proof, and FAQ sections. The product hero uses pear green; treatment cards use distinct colors; the process section uses the Apoth Care display face.

On mobile, content becomes a single readable column, controls remain at least 44px high, and horizontal overflow is not permitted.

### Authenticated surfaces

Account, intake, dashboard, billing, and case-status screens should inherit the same neutral canvas, black controls, rounded geometry, and sans-serif clarity. They should be denser and quieter than marketing pages.

- Show the current state, its meaning, the next action, and who owns it.
- Prefer full-width bands and focused panels over nested cards.
- Keep intake conversational, with one clear question group per step.
- Treat the selected white-label portal as the clinical source of truth and
  Apoth as the commerce, identity, and launch-orchestration layer.
- Keep billing actions visually straightforward and separate from clinical decision-making.

## Shape, elevation, and motion

- Use rounded rectangles in the 16px to 28px range and pill-shaped buttons.
- Soft shadows are part of the reference at rest, especially on menus, pricing panels, FAQ items, and product cards.
- Interactive cards may lift slightly and gain a stronger soft shadow on hover or keyboard focus.
- Sticky navigation may use blur and a restrained shadow.
- Reveal transitions should be short and subtle. Marquees may pause on hover.
- Respect `prefers-reduced-motion` and preserve all information without animation.

## Components

### Buttons

- Primary: near-black fill, white label, pill shape.
- Outline: transparent or white fill with a quiet border.
- Minimum interactive height: 44px.
- Use direct action labels such as "Get started", "Start online visit", and "Login".

### Navigation

- Keep the Apoth wordmark left-aligned.
- Route patient access to `/sign-in` and purchase entry to
  `/checkout?product=weight`.
- Mobile navigation opens as a full-width panel below the sticky header and uses a soft shadow.

### Cards and accordions

- Product cards may use full-color photography, illustrated product still lifes, or a category color field.
- FAQ items are white rounded cards with a subtle resting shadow.
- Focus states use a neutral dark ring rather than a legacy clay ring.

## Content and compliance

- Apoth Health LLC is a technology platform, not a medical provider.
- Clinical decisions belong to independent licensed providers through the
  selected white-label clinical portal.
- Compounded medications must retain the required not-FDA-approved disclosure and brand-name distinction.
- Legal pages retain their review banners until counsel approval.
- Stripe metadata remains free of PHI and uses only opaque identifiers.
- Questionnaire answers are collected and retained by the approved clinical
  portal; they are not rendered or persisted by Apoth.

## Do and do not

### Do

- Match the reference fonts and exact color values on `/` and `/weight-loss`.
- Keep imagery in full color.
- Use black primary controls and category color for large storytelling moments.
- Preserve asymmetric layouts, generous whitespace, and soft reference shadows.
- Connect every visible action to a real route or intentionally remove it.
- Validate desktop and mobile layouts, keyboard focus, contrast, and reduced motion.

### Do not

- Do not translate the reference into the retired clay-and-sage system.
- Do not substitute Fraunces or Inter for reference typography on new marketing pages.
- Do not desaturate, grayscale, sepia-tone, or recolor reference imagery.
- Do not flatten reference cards by removing their resting shadows.
- Do not introduce gradient text, decorative side-stripe borders, countdowns, or pressure tactics.
- Do not imply that Apoth practices medicine, stores the clinical chart, or controls clinical decisions.

## Current implementation status

- `/` and `/weight-loss` are the reference implementation for this direction.
- `/about`, `/privacy`, and `/terms` use the reference typography, neutral
  reading canvas, rounded navigation panels, and dark shared footer.
- `/checkout`, `/checkout/complete`, `/verify`, and `/portal/launch` use a
  focused commerce receipt expression of this system: neutral canvas, black
  pill actions, soft elevated panels, and clear `$0 today`/clinical-approval
  disclosures. Legacy intake routes redirect into this funnel.
- The standalone patient-app build shares the same tokens and components.
- Future migrations must not change clinical, identity, payment, or data-flow
  boundaries as part of a visual redesign.
