# Waitlist launch mode

Status: **Stage 1 built, uncommitted. Stage 2 not started.**
Last worked: 2026-10-15. Branch `main`, level with `origin/main` at `eca59a9`.

## Why

We want to run test ads to gauge interest before selling. The site should
present products as coming soon and collect interest, without losing the
sellable configuration we already built.

## The approach

`APOTH_LAUNCH_MODE` selects `live` or `waitlist`. **Both states ship in every
build.** Switching is an environment change plus a redeploy, never a code
change, so the sellable path stays exercised rather than rotting on a branch
that has to be merged back.

The marketing site is a static export, so the flag is resolved at build time.
"Flip the flag" means: change the variable in the deploy workflow, re-run the
deploy (~2 min). It is not a live runtime toggle.

Defaults to `waitlist`. A missing or malformed value must not present products
as purchasable: showing "coming soon" while we are in fact selling costs a
conversion, the reverse advertises treatment we cannot deliver.

### Variables

| Variable | Where | Notes |
|---|---|---|
| `APOTH_LAUNCH_MODE` | marketing build | `live` \| `waitlist` |
| `NEXT_PUBLIC_LAUNCH_MODE` | marketing build | mirror for client components |
| `VITE_LAUNCH_MODE` | patient app build | `live` opens enrollment routes |
| `NEXT_PUBLIC_WAITLIST_ENDPOINT` | marketing build | **not yet set — see Stage 2** |

None of these are wired into `.github/workflows/deploy-static-ui.yml` yet. That
is the first thing to do when picking this back up, or deploys will keep
defaulting to `waitlist` with no way to switch.

## Stage 1 — done, uncommitted

New files:

- `src/lib/launch-mode.ts` — resolves and validates the mode
- `src/lib/product-availability.ts` — each surface asks "what should I offer
  for this product?" instead of hardcoding a CTA
- `src/components/WaitlistForm.tsx` + `.module.css`

Modified: `src/app/page.tsx`, `src/app/weight-loss/page.tsx`,
`src/app/nad/page.tsx`, `src/app/not-found.tsx`, `src/components/Nav.tsx`,
`src/components/Footer.tsx`, `src/patient/PatientApp.tsx`,
`src/patient/config.ts`, `src/app/__tests__/marketing-pages.test.tsx`.

Verified by building both ways:

| | waitlist | live |
|---|---|---|
| `get-started?product=weight` in `/weight-loss` | 0 | 26 |
| "Join the waitlist" CTAs | 22 | 0 |
| Weight-loss CTA | Join the waitlist | Start the $0 precheck |

Enrollment entry (`/get-started`, `/checkout`, `/intake`) redirects to
`/weight-loss#waitlist` in waitlist mode, so a stale ad URL cannot reach a
purchase flow. Sign-in and the dashboard stay open for existing accounts.

Tests: three new cases for waitlist mode; the existing marketing tests now pin
`APOTH_LAUNCH_MODE=live` explicitly rather than relying on the default. Suite
is back to the 9 pre-existing failures (`CheckoutStart` jsdom
`localStorage.clear`, plus intake / mdi-intake / route-states) — all unrelated
and present before this work.

## Stage 2 — not started. Ads cannot collect emails until this is done.

The form currently renders a visible `TODO: WAITLIST ENDPOINT` notice and the
submit button is disabled. It **fails closed on purpose** — silently
discarding signups would be worse than not offering the form.

The marketing origin is static S3/CloudFront with no API routes, so the
endpoint has to be a Lambda in the CDK stack, like the existing
`infra/src/lambda/*` handlers. Needed:

1. A waitlist Lambda accepting `{ email, product }`
2. A DynamoDB item, e.g. `pk: WAITLIST#<product>`, `sk: EMAIL#<address>`
3. An API Gateway route, CORS allowing the marketing origin
4. `NEXT_PUBLIC_WAITLIST_ENDPOINT` set in the deploy workflow
5. **Manual run of the Deploy staging infrastructure workflow** — the static UI
   deploy does not touch the CDK stack. This is the same step that was needed
   to make `/nad` serve.

### Data boundary

The form collects an email address and an opaque product code, nothing else.
No name, phone, date of birth, state, or clinical question. That keeps it
outside PHI handling entirely. Do not widen it without a compliance decision —
the constraint is the reason the markup has only one input, and there is a test
asserting that.

## Open questions for whoever picks this up

- **Prices are still shown on `/weight-loss` in waitlist mode** ($199 / $299).
  Reads as "here is the price, you just cannot buy yet", which is fine for
  testing price sensitivity but anchors numbers before Stripe is configured.
  Decide whether to hide them for a pure interest test.
- **`/nad` is `robots: noindex`.** If ads point at it, that has to change.
- **`publicProductCodes` is still `["weight"]`** with one `priceLabel`
  spanning `$199–$299`, while the page shows two plans at two prices. If
  semaglutide and tirzepatide should bill separately they each need their own
  product code and Stripe price.

## Also uncommitted, unrelated to this feature

A hero image experiment on the home page, from a "test how this looks" request:

- `public/images/apoth-vial-hand.webp` (new) — replaces the studio shot in the
  "Weight care, built around you" card
- `src/app/home.module.css` — removed the pear gradient overlay; changed
  `.productImage` `object-position` to `58% center`

**Known issue:** with the gradient gone, "Provider-led GLP-1 options from
$199/month" sits on bright foliage and is close to illegible. Unresolved.
Options discussed: a neutral dark scrim with white copy, or reframing so darker
foliage sits behind the text. Revert is `git checkout -- src/app/home.module.css`
plus pointing `page.tsx` back at `apoth-weight-loss-hero.webp`.

`/weight-loss` still uses the original studio hero, so the two pages currently
show different product imagery.

## Reference points

- `launch/live-commerce-2026-09-18` — tag at `eca59a9`, the last state where
  products were purchasable by default. A reference only; the sellable config
  still ships, reachable with `APOTH_LAUNCH_MODE=live`.
- Deploying a new public page needs **three** lists to agree, learned the hard
  way with `/nad`: `requiredRoutes` in `scripts/export-static-routes.mjs`, the
  artifact check in `deploy-static-ui.yml`, and `staticRoutes` in the
  CloudFront function in `infra/src/serverless-platform-stack.ts`. Miss the
  third and the page 404s in production while every build reports success.
