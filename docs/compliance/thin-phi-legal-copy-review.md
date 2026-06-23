# Thin-PHI Legal Copy Review Checklist

Last updated: 2026-06-23

## Scope

This checklist supports attorney review for T-077. It covers public copy changes
on `/privacy`, `/terms`, `/about`, and home-page modules that previously risked
overstating Apoth's clinical-storage role or launch availability promises.

## Boundary Confirmed In Copy

- Apoth Health LLC is described as a technology platform, not a medical provider
  and not a pharmacy.
- Apoth-owned responsibilities are limited to account, commerce/billing
  orchestration, intake UI, support, consent evidence, minimal linkage records,
  and patient-safe workflow status.
- MD Integrations is described as the clinical system of record for
  questionnaire answers, clinician review, treatment decisions, clinical
  messages, and medical records.
- Clinical questionnaire answers are described as processed transiently for MDI
  handoff and not retained as Apoth's own local clinical record after successful
  submission.
- Stripe/payment metadata is described as limited to opaque, non-PHI identifiers.
- Pharmacy, state availability, and refund promises are qualified by clinician
  licensure, clinical eligibility, pharmacy shipping, applicable law, and the
  pending refund/support workflow.

## Counsel Review Questions

- Confirm whether Apoth's pending business-associate/compliance posture with MD
  Integrations is accurately described for transient intake handoff, minimal
  linkage records, patient support, and dashboard/status display before
  production PHI is handled.
- Confirm whether the Physician Group NPP can be hosted in this form on Apoth's
  site and whether MD Integrations requires exact legal-entity names, contact
  details, state-specific addenda, or replacement language.
- Confirm whether the refund policy phrasing is appropriate before T-103 defines
  the operational Stripe action matrix.
- Confirm whether nationwide availability language is acceptable before T-066
  finalizes the pharmacy partner and coverage evidence.
- Confirm whether privacy, platform terms, and telehealth consent version bumps
  are sufficient for re-acceptance, or whether the compounded-medication
  disclosure version should also change.

## Follow-Up Tracker References

- T-028: attorney review/sign-off for legal copy remains required before launch.
- T-029: placeholder support/privacy/legal emails and phone number remain open.
- T-030: real mailing address remains open.
- T-031: MD Integrations NPI and required clinical entity details remain open.
- T-032: compounded pharmacy disclosure/legal details remain open.
- T-066: pharmacy partner selection, BAA, shipping coverage, and disclosure
  evidence remain open.
- T-070: vendor BAA/evidence register remains the source of truth for BAA paths.
- T-103: refund matrix and Stripe action/evidence contract remains out of scope
  for this copy-only change.

## Regression Checks Added

- `src/app/__tests__/legal-copy.test.tsx` verifies the thin-PHI boundary,
  billing invariant refund copy, qualified state availability language, and
  updated consent versions.
- `tests/e2e/compliance-public.spec.ts` keeps public-page checks aligned with
  the technology-platform and MDI clinical-system-of-record posture.
