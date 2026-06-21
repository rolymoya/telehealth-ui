# POST /v1/clinician/cases/:case_id/cancelled

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-clinician-cases-case-id-cancelled-set-case-as-cancelled`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/clinician/cases/:case_id/cancelled`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/cancelled`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Case Status`
- Source request: `Set case as Cancelled`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
