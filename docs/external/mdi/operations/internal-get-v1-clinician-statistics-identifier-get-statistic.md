# GET /v1/clinician/statistics/:identifier

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-statistics-identifier-get-statistic`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/statistics/:identifier`
- Raw URL template: `{{url}}/v1/clinician/statistics/:identifier`
- Source folders: `Internal` / `Clinicians App (V1)` / `Statistics`
- Source request: `Get statistic`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `identifier`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
