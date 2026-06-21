# GET /v1/clinician/statistics/count/completed-cases/:year/:month/:day

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-statistics-count-completed-cases-year-month-day-get-count-of-completed-cases-by-period`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/statistics/count/completed-cases/:year/:month/:day`
- Raw URL template: `{{url}}/v1/clinician/statistics/count/completed-cases/:year/:month/:day?all_clinicians=REDACTED_SCALAR&is_live=REDACTED_SCALAR&is_sandbox=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Statistics`
- Source request: `Get count of completed cases by period`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `day`, `month`, `year`
- Query params: `all_clinicians`, `is_live`, `is_sandbox`, `partner_id`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
