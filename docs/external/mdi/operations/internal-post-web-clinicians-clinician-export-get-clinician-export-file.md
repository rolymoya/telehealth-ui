# POST /web/clinicians/:clinician/export

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-clinicians-clinician-export-get-clinician-export-file`
- Surface: `internal`
- Method: `POST`
- Path: `/web/clinicians/:clinician/export`
- Raw URL template: `{{url}}/web/clinicians/:clinician/export`
- Source folders: `Internal` / `Web` / `Clinicians`
- Source request: `Get Clinician Export File`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `clinician`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
