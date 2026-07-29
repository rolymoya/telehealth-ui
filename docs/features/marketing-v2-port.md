# Marketing v2 port

## Scope

- Replace the existing landing-page composition with the redesigned marketing
  page from `apoth-ui-v2`.
- Add the redesigned `/weight-loss` product page.
- Bring over only the image assets used by those two routes.
- Convert those assets to compact WebP files and copy `public/` into the static
  export so S3-hosted pages do not depend on Next’s runtime image optimizer.
- Connect all primary actions to the existing `/get-started`, `/sign-in`,
  `/about`, `/privacy`, and `/terms` routes.

## Project adaptations

- Keep Apoth Health LLC identified as the technology platform, not the medical
  provider.
- Retain explicit not-FDA-approved language for compounded semaglutide and
  compounded tirzepatide.
- Preserve the reference project’s exact font choices, color values, full-color
  imagery, spacing, radii, soft shadows, and motion. Do not restyle the port to
  match the retired clay-led, serif-first direction.
- Remove inactive newsletter, social, review, and placeholder links rather than
  presenting controls that do not work in this project.
- Reuse the existing Cognito and intake entry routes instead of creating
  parallel login or eligibility flows.
- Treat `DESIGN.md` as the documented direction for subsequent marketing and
  patient-product work.

## Verification

- Typecheck and build the Next.js app.
- Run the existing Vitest suite.
- Capture desktop and mobile screenshots of `/` and `/weight-loss`, then check
  layout, routing, focus behavior, and obvious console errors.
