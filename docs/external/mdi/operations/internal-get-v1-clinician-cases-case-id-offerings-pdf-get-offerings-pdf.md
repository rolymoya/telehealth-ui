# GET /v1/clinician/cases/:case_id/offerings/pdf

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-cases-case-id-offerings-pdf-get-offerings-pdf`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/cases/:case_id/offerings/pdf`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/offerings/pdf?is_automatic_only=REDACTED_SCALAR&export_type=REDACTED_SCALAR&scope=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Offerings`
- Source request: `Get Offerings PDF`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `export_type`, `is_automatic_only`, `scope`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
