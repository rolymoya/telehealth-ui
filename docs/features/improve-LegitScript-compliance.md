# improve-LegitScript-compliance

| | |
|---|---|
| Branch | `improve-LegitScript-compliance` |
| PR | https://github.com/rolymoya/telehealth-ui/pull/1 |
| Status | Open — content drafts complete, real data + attorney review outstanding before launch |

## Purpose

Build out the pages, disclosures, and content rules LegitScript requires for telehealth certification, and align the codebase with the company's actual corporate structure (Apoth Health LLC + the MD Integrations physician group).

When this branch started, the site was a single-page marketing surface that named a brand that turned out to be wrong (Apothem → Apoth), referenced a sister-entity physician group that doesn't exist (Apothem Medical PA → MD Integrations), claimed coverage in "28 states and counting" (now all 50), and was missing every page LegitScript reviewers check for: Privacy Policy with HIPAA, Notice of Privacy Practices, Terms of Service, telehealth disclosure, refunds and cancellation policy, an About page, and a way to contact a human.

## Commits

1. `e2246ea` — Lay groundwork for LegitScript compliance (the 5-task buildout)
2. `bffd291` — Rebrand to Apoth and tighten section copy

## What landed

### New routes

- **`/about`** — corporate-structure disclosure (the three legal entities and what each one does), the full 50-state availability list at `#states`, and contact channels at `#contact`. Every contact value is currently a visible `TODO:` chip.
- **`/privacy`** — HIPAA-aware Privacy Policy with sticky left-rail TOC. Eleven sections covering PHI handled, uses, sharing (with the physician group, with the licensed pharmacy partner, with BAA'd vendors), patient rights, security, breach notification, retention, cookies, children, changes, and contact. Includes the full HIPAA Notice of Privacy Practices at `#notice-of-privacy-practices` with all the standard required elements (TPO uses, authorization requirements, patient rights, complaint channels, effective date).
- **`/terms`** — Terms of Service with sticky left-rail TOC. Eighteen sections including the critical "Apoth is a technology platform, not a medical provider" framing, the clinical-services / pharmacy-services separation, FDA-status disclosure for compounded medications, fees + auto-renewal, disclaimers, limitation of liability, arbitration with class-action waiver and 30-day opt-out, Illinois governing law. Includes the Telehealth Disclosure at `#telehealth-disclosure` and the Refunds and Cancellation Policy at `#refunds-and-cancellation`.
- **`/get-started`** — stub so primary CTAs no longer 404. To be replaced with the real intake flow on a future branch.

### Homepage content fixes

- **Pricing language** — stripped every "From / starting at / starting points" reference (`Pricing.tsx`, `Hero.tsx`). Added a `pricingTiers: PricingTier[] | null` field to the `Condition` type; while tiers are `null`, each row renders a dashed-border `TODO: tiered pricing` callout that labels the existing single number as a placeholder so it can't be mistaken for finalized pricing.
- **FDA disclosure on Conditions cards** — every compounded medication now carries an explicit "Not FDA-approved" badge plus the qualifier that compounded semaglutide and tirzepatide are *not* the same as Ozempic / Wegovy / Mounjaro / Zepbound (`Conditions.tsx`, `data.ts`).
- **Pharmacy step in `HowItWorks`** — added a fourth step that says, in plain language, that Apoth doesn't dispense medication and the pharmacy is a separate licensed entity. Old flow was 3 steps and jumped clinician → treatment.
- **Footer disclaimer** — expanded from one paragraph to two, covering the platform / physician group / pharmacy split, compounded-meds-are-not-FDA-approved, results vary, prescription required from an independent licensed clinician, and the emergency 911 redirect.
- **All-50-states copy** — replaced every "28 states" mention with "all 50 states" (`Hero.tsx`, `Footer.tsx`, FAQ in `data.ts`), and rephrased the named-three-clinicians framing so it doesn't imply exhaustive coverage (`Clinicians.tsx`).

### Rebrand + corporate-structure change

- **Brand**: Apothem → Apoth (wordmark, page titles, all marketing copy).
- **Platform entity**: Apothem Health PBC (Delaware public benefit corporation) → **Apoth Health LLC** (Illinois limited liability company).
- **Physician group**: Apothem Medical PA → **MD Integrations**. Note: MD Integrations is a real independent third-party physician services provider, not a sister entity. This is a structurally stronger LegitScript signal than the friendly-PA model — the independence is genuine.
- **Governing law in Terms**: Delaware → Illinois (matched to the LLC's home state).

### Reusable pieces

- **`Nav.tsx`** now accepts a `variant: "dark" | "light"` prop so the same nav works on the dark Hero and on cream-bg subpages.
- **`LegalReviewBanner.tsx`** — small shared component that puts a "Draft for legal review — not legal advice" banner at the top of `/privacy` and `/terms`. The legal pages explicitly call out that they need attorney review before launch.

### Copy tightening

The original copy leaned indie-press literary; tightened the following section headers and lines to match the plain-spoken voice the PRODUCT.md voice notes describe:

| Where | Before | After |
|---|---|---|
| Hero eyebrow | "Telehealth, made considered" | "Real visits, named clinicians" |
| Hero H1 | "Care for the things you quietly look up at night." | "A clearer way to get care, online." |
| Hero subhead | "…the categories you wish were less of a search-bar moment…" | "Apoth connects you with a US-licensed clinician for sexual health, hair, weight, and physician-supervised peptide protocols. Eligibility is determined by a clinician licensed in your state — not by a checkout flow." |
| Hero sub-CTA | "Cash-pay, no insurance gymnastics." | "Cash-pay only." |
| HowItWorks H2 | "Four steps. None of them invented to feel like progress." | "Four steps, each with a real person at the other end." |
| Pricing H2 | "All-in monthly pricing, on the same page as the rest of the site." | "All-in monthly pricing. The number you see is the number you pay." |
| Clinicians H2 | "Real clinicians, named on the page they work behind." | "You'll know who's reading your chart." |
| FAQ H2 | "Answered without lawyer voice." | "If yours isn't here, a visit can answer it." |
| Browser tab title | "Apoth · Telehealth, made considered" | "Apoth · Real visits, named clinicians" |
| Footer tagline | "Telehealth, made considered. We see adults in all 50 states for…" | "Real visits, named clinicians, in all 50 states. We see adults for…" |

## Key decisions

- **Three real pages, not eight.** Initial plan had separate routes for Privacy, Terms, About, Contact, States, Telehealth Disclosure, Cancellation, and NPP. LegitScript cares the info exists and is findable, not that it lives at specific URLs. Collapsed to `/about` (with `#states` and `#contact` anchors), `/privacy` (with NPP as `#notice-of-privacy-practices`), and `/terms` (with `#telehealth-disclosure` and `#refunds-and-cancellation` as anchors).
- **All 50 states, in writing.** The original code claimed "28 states and counting," which would have required maintaining an actual list. The product decision was to launch in all 50 states via the MD Integrations physician network and the pharmacy partner's shipping coverage. Every "28 states" reference now reads "all 50 states."
- **MD Integrations over a friendly-PA sister entity.** Naming a real independent third-party physician group is a stronger LegitScript signal than the friendly-PC / friendly-PA model some telehealth platforms use, because the independence is genuine rather than structural-only.
- **Illinois LLC + Illinois governing law.** Matched governing law in `/terms` section 15 to the LLC's home state for consistency. If the legal preference is to keep Delaware-law jurisdiction with an Illinois-formed LLC, that's a single-line revert.
- **Full attorney-review-ready legal drafts, with a visible banner.** Privacy and Terms are written with substantive content (HIPAA-aware policy, full NPP, telehealth disclosure, refunds matrix), but each page carries the `LegalReviewBanner` at the top so they can't ship as final without explicit attorney sign-off.
- **Visible `TODO:` placeholders for every piece of real data.** Contact email/phone/address, pharmacy partner name + license numbers, NPI, tier pricing — all rendered with a monospace clay-deep `TODO:` chip so they can't be mistaken for finalized content during dev.

## TODOs / launch blockers

These are explicitly out of scope for this PR but must be resolved before LegitScript submission or launch:

- [ ] **Healthcare attorney review** of `/privacy` and `/terms`. The `LegalReviewBanner` is on both pages until this happens.
- [ ] **Real contact info** — replace `support@apoth.example`, `privacy@apoth.example`, `legal@apoth.example`, `hello@apoth.example`, and the `1-800-555-0144` phone placeholder. Used in: `Footer.tsx`, `/about#contact`, `/privacy` section 11, `/terms` sections 14 and 18, `/terms#refunds-and-cancellation`.
- [ ] **Mailing address** — placeholder `[street address], [city, state ZIP]` appears in `Footer.tsx`, `/about#contact`, `/privacy` section 11, `/terms` section 18.
- [ ] **Pharmacy partner disclosure** — name of the 503A compounding pharmacy partner, its state of licensure, and its NABP / state pharmacy license number. Goes in the third entity card in `/about`.
- [ ] **NPI** — placeholder `0000000000 (TODO: real NPI)` in `Footer.tsx`.
- [ ] **Tier pricing** — `data.ts` has a `pricingTiers: PricingTier[] | null` field on every `Condition`, currently `null`. Populate each condition's tiers and the placeholder UI in `Pricing.tsx` switches automatically to the real tier list.
- [ ] **Production domain** — set `NEXT_PUBLIC_SITE_URL` env var at deploy time. `layout.tsx` falls back to `http://localhost:3000` otherwise.
- [ ] **Build the real `/get-started` intake flow.** Currently a stub that routes back to the homepage Conditions and HowItWorks sections.
- [ ] **HTTPS + WHOIS** — deployment + registrar concerns. WHOIS should be either public or use a verified registrar privacy product, not generic privacy protection.

## File map

### New files
- `src/app/about/page.tsx`
- `src/app/get-started/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `src/components/LegalReviewBanner.tsx`

### Modified files
- `src/app/layout.tsx` — metadata title, `metadataBase` now reads from env
- `src/components/Clinicians.tsx` — clarifying sentence so 3 named clinicians don't imply exhaustive coverage; tightened H2
- `src/components/Conditions.tsx` — FDA-status row on every card
- `src/components/Faq.tsx` — tightened H2 + body
- `src/components/Footer.tsx` — collapsed 8 dead footer links into 3 real pages with anchors; expanded disclaimer; rebrand; 50-states copy
- `src/components/Hero.tsx` — rewritten eyebrow/H1/subhead; removed dollar values from right-rail catalog; 50-states copy
- `src/components/HowItWorks.tsx` — added 4th step for pharmacy fulfillment; tightened H2
- `src/components/Icons.tsx` — wordmark text
- `src/components/Nav.tsx` — added `variant` prop
- `src/components/Pricing.tsx` — stripped "from / starting at"; tiered-pricing TODO UI; tightened H2
- `src/lib/data.ts` — added `fdaStatus` + `fdaNote` + `pricingTiers` to `Condition`; added `usStates` (all 50); rewrote FAQ entry on states; nav anchors changed to absolute paths so they work from subpages
- `.gitignore` — added `tsconfig.tsbuildinfo`

## Testing notes

- `npx next build` produces all routes (`/`, `/about`, `/get-started`, `/privacy`, `/terms`) as static.
- Walk the homepage and verify the 4-step HowItWorks, the FDA-status disclosure on the Weight and Peptides cards, and the no-pricing right-rail in the Hero.
- Click every footer link; nothing should 404. Anchor links (`/about#states`, `/about#contact`, `/terms#telehealth-disclosure`, `/terms#refunds-and-cancellation`, `/privacy#notice-of-privacy-practices`) should scroll to the right section.
- On the legal pages, confirm the sticky left-rail TOC stays visible on `lg:` viewports and that the `LegalReviewBanner` is at the top of `/privacy` and `/terms`.
- Case-insensitive grep `grep -rni "apothem" .` from the repo root (excluding `node_modules`, `.next`, `.git`) should return zero matches.
- Case-insensitive grep for "starting at" / "from $" anywhere user-visible should return zero matches.

## Conventions established on this branch

- Visible `TODO:` chip (monospace, uppercase, clay-deep) for any user-visible content waiting on real data. Pattern: `<span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">TODO:</span> placeholder-value`.
- Long-form legal pages use a local `Section` helper inside the same file (id + title + children) for consistent typography and anchor-jumping. See `/privacy` and `/terms` for the pattern.
- Subpages on cream backgrounds use `<Nav variant="light" />`; the dark Hero uses the default `<Nav />` (variant `"dark"`).
- Legal pages mount `<LegalReviewBanner />` directly after the Nav until counsel has reviewed.

## Commit log (auto-appended)

_Auto-generated by .claude/hooks/append-commit-to-md.sh on each \`git commit\`. Newest entries at the bottom._

### bffd291 · 2026-05-15T14:22:04-05:00

Rebrand to Apoth and tighten section copy

```
 src/app/about/page.tsx               | 28 ++++++++--------
 src/app/get-started/page.tsx         |  4 +--
 src/app/layout.tsx                   |  2 +-
 src/app/privacy/page.tsx             | 36 ++++++++++-----------
 src/app/terms/page.tsx               | 62 ++++++++++++++++++------------------
 src/components/Clinicians.tsx        |  2 +-
 src/components/Faq.tsx               |  7 ++--
 src/components/Footer.tsx            | 18 +++++------
 src/components/Hero.tsx              | 16 +++++-----
 src/components/HowItWorks.tsx        |  4 +--
 src/components/Icons.tsx             |  2 +-
 src/components/LegalReviewBanner.tsx |  2 +-
 src/components/Nav.tsx               |  2 +-
 src/components/Pricing.tsx           |  2 +-
 14 files changed, 94 insertions(+), 93 deletions(-)
```
