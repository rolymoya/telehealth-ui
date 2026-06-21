# GET /v1/clinician/partners/:partner_id/compounds/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-partners-partner-id-compounds-search-search-for-compounds-from-a-given-partner`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/partners/:partner_id/compounds/search`
- Raw URL template: `{{url}}/v1/clinician/partners/:partner_id/compounds/search?name=REDACTED_SCALAR&patient_id=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Partners` / `Compounds`
- Source request: `Search for compounds from a given partner`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `partner_id`
- Query params: `name`, `patient_id`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
