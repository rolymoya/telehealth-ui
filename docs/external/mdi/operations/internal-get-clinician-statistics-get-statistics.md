# GET /clinician/statistics

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-clinician-statistics-get-statistics`
- Surface: `internal`
- Method: `GET`
- Path: `/clinician/statistics`
- Raw URL template: `{{url}}/clinician/statistics?start_date=REDACTED_SCALAR&end_date=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)`
- Source request: `Get Statistics`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `columns[]`, `end_date`, `start_date`, `view`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
