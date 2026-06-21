# GET /clinician/partners/:partner_id/offerings/:offering/offerings

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-clinician-partners-partner-id-offerings-offering-offerings-get-offering-offerings`
- Surface: `internal`
- Method: `GET`
- Path: `/clinician/partners/:partner_id/offerings/:offering/offerings`
- Raw URL template: `{{baseUrl}}/clinician/partners/:partner_id/offerings/:offering/offerings?type=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Partners` / `Offerings`
- Source request: `Get Offering Offerings`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `offering`, `partner_id`
- Query params: `type`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
