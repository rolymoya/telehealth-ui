# POST /patient/cases/:case/files/:file

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-patient-cases-case-files-file-attach-file`
- Surface: `internal`
- Method: `POST`
- Path: `/patient/cases/:case/files/:file`
- Raw URL template: `{{baseUrl}}/patient/cases/:case/files/:file`
- Source folders: `Internal` / `Patient App (V1)` / `Patient` / `Cases` / `Files`
- Source request: `Attach File`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `case`, `file`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
