# Reference design rollout

## Scope

- Extend the visual direction established by `/` and `/weight-loss` to every
  remaining Next.js page and the standalone patient application.
- Preserve all authentication, intake, consent, MDI, dashboard, billing, legal,
  and error-state behavior.
- Keep compliance copy and the legal-review banners intact.

## Shared direction

- Arial and Helvetica provide the default page and interface typography.
- Georgia remains limited to the Apoth wordmark.
- The neutral canvas, black pill actions, blue utility color, yellow context
  field, mint care field, rounded geometry, and soft elevation come directly
  from the reference system.
- The shared navigation and footer use the same structure and links as the
  ported marketing pages.

## Surface adaptations

- Legal pages use a grey reading header, white article sheet, and sticky rounded
  table of contents.
- Authentication uses a blue context panel beside a white form panel.
- Visit entry uses yellow for orientation; intake uses mint; clinical intake
  uses blue. Color identifies the type of work without changing behavior.
- Dashboard and route states use white operational cards with compact status
  capsules and a restrained colored context surface.
- The standalone patient app inherits the same root tokens and shared
  components as the Next.js application.

## Verification

- Run TypeScript, Vitest, the Next.js production build, and the standalone
  patient-app build.
- Review representative public, legal, authentication, visit-entry, and route
  state pages in the browser.
- Confirm full-color imagery, Arial/Helvetica page typography, dark primary
  actions, no horizontal overflow, visible focus states, and working route
  links.
