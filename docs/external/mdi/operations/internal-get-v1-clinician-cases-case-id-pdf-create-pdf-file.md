# GET /v1/clinician/cases/:case_id/pdf

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-cases-case-id-pdf-create-pdf-file`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/cases/:case_id/pdf`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/pdf?create_as_file=REDACTED_SCALAR&automatic_only=REDACTED_SCALAR&is_only_prescriptions=REDACTED_SCALAR&is_create_as_base64=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases`
- Source request: `Create PDF file`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `automatic_only`, `create_as_file`, `is_create_as_base64`, `is_only_prescriptions`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
