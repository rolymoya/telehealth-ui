# PATCH /v1/clinician/cases/:case_id/files/:file_id/tags/:tag_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-v1-clinician-cases-case-id-files-file-id-tags-tag-id-update-a-case-file-tag`
- Surface: `internal`
- Method: `PATCH`
- Path: `/v1/clinician/cases/:case_id/files/:file_id/tags/:tag_id`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/files/:file_id/tags/:tag_id`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Files` / `Tags`
- Source request: `Update a case file tag`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `file_id`, `tag_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
