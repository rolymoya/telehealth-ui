# Telehealth Reference Visual Audit

## Purpose

This audit translates the visual language of Hims and Eden into an original direction for Apoth. It covers the public homepage, treatment discovery, product detail, conversion, and questionnaire surfaces on desktop and mobile—not just the landing pages supplied as references.

The intended result is not a visual clone. The strongest synthesis is:

- **Hims supplies the art direction:** cinematic product photography, editorial composition, warm human texture, restrained typography, and fewer visible UI containers.
- **Eden supplies the commerce system:** treatment taxonomy, category color, explicit pricing and inclusions, decisive black actions, and a clear questionnaire grammar.
- **Apoth supplies the trust model:** plainspoken boundaries, transparent payment timing, independent-provider language, and a quiet handoff into the clinical portal.

Working name: **Everyday Care, Studio Clear — Editorial Edition**.

## Surfaces reviewed

The review sampled desktop and mobile presentations of:

- Hims homepage, a weight-loss product detail page, and questionnaire entry.
- Eden homepage, a GLP-1 product detail page, and questionnaire entry.
- Brello homepage and product detail as a useful counter-reference.
- The current Apoth homepage, weight-loss page, shared marketing system, and existing design specification.

Visual behavior was assessed at the level of typography, color, composition, photography, geometry, elevation, navigation, controls, responsive changes, and the shift from marketing into task-focused UI.

## Executive direction

Apoth should feel like a modern consumer-care brand with the compositional confidence of Hims and the shopping clarity of Eden. The site should use large, art-directed product imagery and calmer editorial layouts, then become progressively quieter as a person moves from discovery to checkout and the external clinical intake.

The clearest formula is:

> **Editorial outside, operational inside.**

Public pages can be visual, spacious, and expressive. Pricing and checkout should become explicit and structured. Verification and portal launch should be almost frictionless. The clinical questionnaire remains owned by the selected white-label provider; Apoth should influence its theme where the provider permits, but must not recreate or store clinical questions locally.

## Reference comparison

| Dimension | Hims | Eden | Brello | Apoth decision |
| --- | --- | --- | --- | --- |
| Overall character | Editorial, mature, image-led | Crisp, optimistic, commerce-led | Playful wellness storefront | Hims restraint plus Eden clarity |
| Typography | Custom sans, moderate display weight, compact hierarchy | Custom sans, bolder display weight, strong labels | Prominent serif/italic display mixed with several sans families | One distinctive grotesk family; serif reserved for the wordmark, if retained |
| Color | Warm neutrals, deep brown, dark blue, photography carries much of the color | Near-white canvas, near-black actions, vivid category fields | Cream, purple, lavender, yellow | Neutral canvas, near-black controls, a small category palette used in large fields |
| Composition | Large editorial crops, asymmetry, broad bands, fewer boxes | Modular product grid, clear cards, strong repeated system | Conventional storefront stacking and promotional modules | Hims macro composition with Eden product structure |
| Photography | Cinematic macro product crops and human moments | Bright studio still lifes on colored backgrounds | Lifestyle-led and promotional | Product still life first; candid human context second |
| Cards | Limited; content often sits directly on the page | Frequent rounded cards with soft elevation | Many promotional containers and badges | Fewer cards than current Apoth; use them only for grouped decisions or summaries |
| Buttons | Near-black, calm, direct | Near-black pills, highly consistent | Bright yellow promotional CTAs | Retain Apoth’s black pill action; reserve yellow for emphasis, not every CTA |
| Product detail | Large image and unboxed details, thin rules | Large color image plus structured pricing/benefit cards | Dense gallery, bursts, ratings, inclusions | Hims shell with Eden’s pricing clarity |
| Questionnaire | Minimal white space, bordered choices, little visual chrome | Minimal shell, visible progress, black selected state | No equivalent pre-purchase flow | Eden progress plus Hims airiness; sticky mobile continuation |
| Mobile behavior | Image-first product story; editorial cards can remain paired | Conversion-first product detail; stacked color cards | Lifestyle image can push action below the fold | Show enough image to establish desire, then surface price and action within roughly one viewport |

## Visual DNA to borrow

### From Hims

1. **Photography as structure**  
   Product imagery should not feel dropped into a card. A crop can become the entire left half of a product page or the visual field of a homepage story. Directional light, tactile surfaces, and close framing make the offer feel tangible.

2. **Editorial pacing**  
   Alternate quiet white space, large media, and full-width tonal bands. The page should not maintain the same three-card rhythm from top to bottom.

3. **Moderate typographic weight**  
   Large text can feel confident without being uniformly extra-bold. Hims uses size, line breaks, and placement more than heavy weight to create hierarchy.

4. **Low-chrome product pages**  
   Product name, benefits, action, and supporting disclosures can sit directly on the canvas. Hairlines and spacing often do more work than nested panels.

5. **Warmth without wellness clichés**  
   Warm beige and brown live primarily in art direction and photography rather than turning the whole interface into a cream-colored boutique.

### From Eden

1. **Category color as wayfinding**  
   Large pear, blue, or warm-neutral fields make treatment families recognizable. Color works best as a spatial system—not as scattered chips, icons, and decorative dots.

2. **Immediate offer comprehension**  
   Product name, active ingredient or treatment type, price cadence, inclusions, and the next action are easy to scan.

3. **Consistent black action grammar**  
   The same high-contrast, rounded primary control carries the user from exploration through selection and intake.

4. **Strong studio still lifes**  
   Products appear crisp and legible against graphic backgrounds. This creates continuity between category cards and product detail.

5. **Visible questionnaire progress**  
   A simple progress cue, large answer rows, and an unmistakable selected state make a long process feel bounded.

### What Brello clarifies by contrast

Brello is useful for understanding what Apoth should avoid: multiple competing font personalities, serif-and-italic wellness tropes, lavender/cream/yellow as an all-over theme, promotional price bursts, and long storefront pages where the primary action can leave the first mobile viewport. Its explicit plan inclusions are useful, but those details should be presented with less promotional chrome.

## Proposed Apoth system

### 1. Typography

Replace the current generic Arial-led marketing hierarchy with one licensed or self-hosted grotesk family that has a distinctive but calm voice. It should support regular, medium, semibold, and bold weights so hierarchy does not depend on 700 everywhere. Avoid attempting to imitate either competitor’s proprietary typeface.

Suggested behavior:

| Role | Desktop | Mobile | Character |
| --- | --- | --- | --- |
| Hero display | 52–64px, 0.92–1.02 line-height | 38–44px, 0.98–1.06 | Moderate or semibold; intentional line breaks |
| Section display | 38–48px | 30–36px | Editorial, compact |
| Product title | 42–48px | 28–36px | Regular-to-medium, not extra-bold |
| Body | 16–18px, 1.45–1.6 line-height | 16–17px, 1.45–1.55 | Plainspoken and highly legible |
| Labels and metadata | 12–14px | 12–14px | Medium weight; modest tracking only where useful |

If the Apoth serif wordmark remains, keep serif type confined to the mark. Do not introduce a second display serif across headings.

### 2. Palette

Use a neutral foundation and let color arrive in broad, meaningful fields.

| Token | Proposed role | Directional value |
| --- | --- | --- |
| Canvas | Default site background | `#F9F9FA` |
| Warm canvas | Editorial or photography transition | `#F7F3ED` |
| Paper | Controls and grouped decisions | `#FFFFFF` |
| Ink | Text and primary actions | `#171719` |
| Muted ink | Secondary explanation | `#626266` |
| Hairline | Dividers and input borders | `#DEDEE1` |
| Pear | Primary weight-care category field | `#9DCC7D` |
| Sun | Small moments of emphasis | `#F2DA68` |
| Care blue | Process, support, or non-clinical system states | `#5D86DF` |
| Warm clay | Photography companion or secondary category | `#C9876A` |

The values are a starting palette, not a requirement to color every component. Most screens should be dominated by canvas, paper, ink, and photography. Keep medical status colors semantically distinct from brand accents.

### 3. Composition

Use three compositional modes rather than one universal card grid:

- **Editorial mode:** homepage stories, education, and brand moments. Large crops, asymmetric split layouts, strong line breaks, and full-width tonal bands.
- **Commerce mode:** treatment discovery and product detail. Clear comparison, price cadence, inclusions, and a dominant action with fewer decorative elements.
- **Task mode:** checkout, verification, portal launch, and provider intake. One narrow column, restrained surfaces, direct status language, and no marketing navigation.

This shift should be visible but still feel like one family through typography, action shape, spacing, and color.

### 4. Imagery

The image system should combine:

- Full-color macro product still lifes with directional light and tactile shadows.
- Graphic category backgrounds inspired by Eden’s wayfinding, but using Apoth’s own palette and arrangements.
- Candid human scenes that show ordinary life, not posed “wellness success” imagery.
- Crops designed for the component rather than generic images placed inside it.

Avoid grayscale imagery, synthetic clinical environments, stock-photo smiles, before-and-after framing, and visual claims that imply guaranteed outcomes. Competitor trademarks, recognizable packaging, compositions, and exact color recipes should not be reproduced.

### 5. Shape and elevation

- Primary buttons remain pills or near-pills.
- Media fields can use 20–28px radii.
- Answer rows and compact decision groups should use 12–16px radii.
- Do not wrap ordinary copy in cards.
- Prefer hairlines, spacing, and background shifts over shadows.
- Reserve soft elevation for overlays, menus, and a genuinely grouped pricing summary.

The current Apoth implementation has too many repeated rounded, shadowed containers. Removing roughly half of those visible boxes would move the result toward the Hims side of the intended blend without sacrificing Eden’s clarity.

### 6. Actions and states

The primary control should be near-black with white text on light or colorful surfaces. Yellow can signal a small highlight, price note, or moment of delight; it should not compete as a second universal CTA color.

Questionnaire choices should use a light hairline at rest, near-black fill when selected, and a clear focus ring. Hover movement should be subtle. On mobile, the continuation action should remain visible near the bottom once a choice is made, subject to the provider portal’s theming capabilities.

### 7. Motion

Use motion at the composition level:

- A restrained reveal for the hero copy and principal image.
- Slow media crop or scale changes on intentional story cards.
- A clear selected-state transition in choice rows.
- A progress transition between questionnaire steps.

Remove the impulse to add lift, glow, sheen, and scale to every card. One orchestrated visual moment per viewport is enough. Respect reduced-motion preferences.

## Route-by-route recipe

### `/` — Homepage

- Keep the opening proposition short and outcome-oriented, with a 52–64px desktop headline and clear first action.
- Follow it with one or two large editorial treatment stories instead of a uniform grid of small cards.
- Let the primary weight-care story combine a macro product image with a pear or warm-neutral field.
- Introduce other care categories through compact visual lanes using consistent color coding.
- Use a full-width, darker educational band to explain how care works and establish the independent-provider boundary.
- Keep trust and legal language visible but typographically calm; do not style compliance copy as alarm text.

### `/weight-loss` — Treatment landing and product selection

- Open with a large editorial image/product composition rather than another boxed hero.
- Present the treatment family and price cadence immediately.
- Use a Hims-like 60/40 desktop product split: large image field on the left, unboxed offer details on the right.
- Use one contained pricing/selection module only where choices genuinely need grouping.
- Keep inclusions explicit in Eden’s manner, but render them as a clean list with hairlines rather than multiple benefit cards.
- On mobile, show a compelling image first but bring product name, starting price, and primary action into view within roughly the first 1–1.25 viewports.

### `/checkout` — Hosted checkout handoff

- Treat Apoth’s pre-checkout or redirect state as task UI: compact wordmark, concise summary, `$0 today` or exact payment timing where true, and one primary action.
- Do not carry the full marketing navigation into this state.
- Stripe metadata and visible copy must remain free of clinical content.
- The hosted Stripe surface cannot be made to mimic the marketing site exactly; continuity should come from logo, approved brand color, concise description, and the return experience.

### `/checkout/complete` and `/verify` — Account completion

- Use a centered 480–520px column with generous white space.
- Show a single status, explanation, and next action.
- Use a slim progress or step label only if it accurately reflects remaining setup.
- Avoid celebratory confetti or decorative dashboards before account verification is actually complete.

### `/portal/launch` — Clinical handoff

- Use the quietest Apoth surface: wordmark, one status message, provider identity, and a secure-launch action or loading state.
- State that the clinical questionnaire and care are provided through the independent clinical partner.
- Do not preview, reproduce, or collect clinical questions in Apoth.
- Make errors actionable: retry, return to account, or contact support.

### White-label provider questionnaire

Where the provider allows theming, request:

- Apoth typography or the nearest permitted neutral sans.
- Near-white background and 480–520px content width.
- Compact Apoth or co-branded mark, back control, and a visible progress bar.
- Large 56–72px-high answer rows with 1px hairlines and 12–16px radii.
- Near-black selected state and full-width primary continuation control.
- A sticky continuation region on mobile so the next action does not disappear below long consent text.

This is a brand specification for the external portal—not authorization to render or persist clinical questionnaire answers inside Apoth.

## Mobile principles

1. Preserve editorial confidence without sacrificing action visibility.
2. Use a compact logo/login/menu shell; remove desktop navigation links.
3. Prefer full-bleed or edge-aligned media over small images trapped in padded cards.
4. Keep all task controls full-width and at least 44px high.
5. Avoid carousels whose next item is invisible; a deliberate two-up story pair is acceptable when both remain legible.
6. Keep critical pricing and action content above or close to the first scroll boundary.
7. Never allow legal copy or trust badges to obscure the next task.

## What should change in the current Apoth UI

The current system is already closer to Eden than Hims. It has a near-white canvas, black pill actions, category colors, bold product panels, and rounded pricing surfaces. The redesign should therefore add Hims rather than layering on more Eden.

### Keep

- Near-black primary actions.
- Near-white canvas.
- The category-color concept, especially pear for weight care.
- Explicit pricing and offer details.
- Strong product still lifes.
- Apoth’s distinctive wordmark and plainspoken copy.

### Change

- Replace the generic Arial-led marketing voice with a distinctive, legally usable grotesk.
- Reduce heavy display weights and use scale and composition for hierarchy.
- Remove many repeated card shells and shadows.
- Expand image fields and use more editorial, asymmetrical crops.
- Consolidate color into a few large fields instead of many small accents.
- Simplify product detail into large media plus mostly unboxed information.
- Replace numerous independent hover sheens/lifts with one restrained motion system.
- Make the transition from marketing to checkout and portal launch visibly calmer.

## Design guardrails

### Do

- Make treatment offers understandable without requiring a scroll through lifestyle copy.
- Use full-color imagery and tactile light to humanize a digital experience.
- Build each page around one dominant visual idea.
- Let compliance and provider boundaries feel deliberate and trustworthy.
- Test the first two mobile viewports as a single conversion composition.
- Maintain WCAG-compliant text, controls, focus, and reduced-motion behavior.

### Do not

- Copy Hims’ photography, packaging, proprietary type, or exact layouts.
- Copy Eden’s card compositions or color assignments one-for-one.
- Drift into Brello’s serif-heavy, cream-purple promotional language.
- Put every section inside a rounded card.
- Use unverified statistics, testimonials, ratings, or outcome claims as visual proof.
- Make the clinical intake appear to be owned or operated by Apoth when it is not.
- Store clinical questionnaire answers in the Apoth frontend or app data layer.

## Recommended visual prototype

Before extending the treatment to every route, prototype three connected screens at desktop and mobile widths:

1. The homepage opening through the first treatment story.
2. The weight-loss product hero through pricing and the first action.
3. The portal launch plus a provider-theme mock showing the intended questionnaire shell.

Those screens contain the important design decisions: editorial imagery, type hierarchy, category color, offer comprehension, action grammar, and the transition from expressive marketing into quiet task UI. Once approved, they can become the visual source of truth for the remaining routes and components.

