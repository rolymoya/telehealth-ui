# Consent Versioning

T-047 defines launch consent evidence as kind-aware DynamoDB records. Each
required consent document has an explicit immutable kind and current version in
`src/lib/consents.ts`.

## Required Launch Kinds

- `platform_terms`: Apoth platform Terms of Service.
- `privacy_notice`: Apoth privacy notice.
- `telehealth_consent`: third-party clinician telehealth consent. This consent
  must not imply that Apoth practices medicine.
- `compounded_medication_disclosure`: launch compounded-medication disclosure,
  including FDA-status language.

## Storage

Consent evidence uses `PATIENT#{cognitoSub}` /
`CONSENT#{consentKind}#{version}` and stores only:

- consent kind
- version
- accepted timestamp
- optional `sha256:` IP hash
- optional `sha256:` user-agent hash

Raw IP addresses, raw user agents, names, emails, Stripe metadata, clinical
context, questionnaire answers, and free text do not belong in consent records.

## Re-Prompt Behavior

Onboarding gates require every current required consent kind. Bumping one
document version makes only that kind stale and re-prompts the user on their
next authenticated visit. Legacy aggregate consent records are treated as stale
because Apoth has no production patient base yet.

## Evidence Exports

The launch export helper is a library-level review primitive for authorized
internal/legal or LegitScript evidence surfaces. It returns only minimal consent
evidence and does not create a public route or document archive.

Rendered legal document snapshots are out of scope until counsel or
LegitScript explicitly requires byte-level archival evidence.
