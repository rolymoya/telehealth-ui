---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/weight-loss/page.tsx","src/app/portal/launch/page.tsx","src/patient/commerce/PortalLaunch.tsx"]
---

## Scope and mode

- Primary target: `src/app/page.tsx`.
- Related targets: `src/app/weight-loss/page.tsx`, `src/app/portal/launch/page.tsx`, and `src/patient/commerce/PortalLaunch.tsx`.
- Homepage and weight-loss surfaces use **Persuade** mode. Portal launch uses **Operate** mode.

## Audience, job, and action

Adults considering clinician-guided weight care should understand the offer, payment timing, and responsible parties quickly, then start at `/get-started?product=weight`. Returning patients should recognize a quiet, secure bridge into the independent provider portal.

## Proof and constraints

- Use only existing verified pricing, product imagery, process facts, and regulated disclosures.
- Apoth is a technology platform, not a medical provider.
- The provider portal owns the clinical questionnaire and clinical record.
- No charge begins before clinical approval and separate acceptance of the exact offer.
- Do not invent clinicians, testimonials, ratings, outcomes, or clinical proof.

## Approved direction

Approved comp: `.impeccable/mocks/apoth-home-b-story-mosaic.png`.

Build the story-mosaic composition from option B and carry forward option C's horizontal treatment strip. Hims contributes editorial image scale, moderate typography, broad tonal bands, and low chrome. Eden contributes pear category fields, immediate offer clarity, black pill actions, and questionnaire/task ergonomics. Apoth contributes transparent ownership and payment boundaries.

## Memorable moment

The first viewport pairs an oversized weight-care product stage with a candid human-care image below a broad outcome headline. The design then progressively sheds marketing expression until the portal handoff becomes a narrow, nearly unboxed task surface.

## Implementation inventory

| Ingredient | Commitment | Medium |
| --- | --- | --- |
| Navigation | Slim announcement, serif wordmark, quiet links, black action | Semantic HTML/CSS |
| Hero headline | Wide moderate-weight grotesk, large but below 6rem | Self-hosted Figtree variable |
| Weight story | Broad pear field, product objects at cinematic scale | Existing Apoth raster asset + semantic copy |
| Human story | Narrow warm field with decisive crop | Existing lifestyle raster asset + semantic copy |
| Treatment strip | Three horizontal lanes separated by hairlines | Semantic links/list |
| Primary action | Near-black pill with direct route | Semantic anchor/button |
| Supporting sections | Editorial bands and unboxed lists, not repeated cards | Semantic HTML/CSS |
| Product page | 60/40 media/detail split with one grouped price decision | Existing raster assets + semantic HTML/CSS |
| Portal launch | 480–760px quiet task column with progress and ownership copy | Semantic form/HTML/CSS |

## Component grammar

- Canvas `#f9f9fa`, paper `#ffffff`, ink `#171719`, warm canvas `#f7f3ed`, pear `#9dcc7d`, sun `#f2da68`, care blue `#5d86df`.
- Figtree variable for interface and display; serif only for the Apoth wordmark.
- Media radii 20–24px; grouped task rows 12–16px; buttons are pills.
- Hairlines and background transitions carry structure. Shadows are limited to menus and overlays.
- One orchestrated reveal/image-scale moment; no universal sheen or lift.

## Unresolved decisions

- The future white-label portal's exact theming controls are unknown.
- Hair and sexual-health destination routes remain outside this prototype scope.
