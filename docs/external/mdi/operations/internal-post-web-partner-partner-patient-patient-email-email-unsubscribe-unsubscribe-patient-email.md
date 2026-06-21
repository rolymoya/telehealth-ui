# POST /web/partner/:partner/patient/:patient_email/email/unsubscribe/

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-partner-partner-patient-patient-email-email-unsubscribe-unsubscribe-patient-email`
- Surface: `internal`
- Method: `POST`
- Path: `/web/partner/:partner/patient/:patient_email/email/unsubscribe/`
- Raw URL template: `{{url}}/web/partner/:partner/patient/:patient_email/email/unsubscribe/`
- Source folders: `Internal` / `Web`
- Source request: `Unsubscribe Patient Email`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `partner`, `patient_email`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
