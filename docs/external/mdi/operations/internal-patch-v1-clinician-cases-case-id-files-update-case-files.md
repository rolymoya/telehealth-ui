# PATCH /v1/clinician/cases/:case_id/files

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-v1-clinician-cases-case-id-files-update-case-files`
- Surface: `internal`
- Method: `PATCH`
- Path: `/v1/clinician/cases/:case_id/files`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/files`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Files`
- Source request: `Update case files`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
