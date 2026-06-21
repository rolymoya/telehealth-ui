# GET /v1/status/:plataform

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `status-get-v1-status-plataform-get-api-status`
- Surface: `status`
- Method: `GET`
- Path: `/v1/status/:plataform`
- Raw URL template: `{{url}}/v1/status/:plataform`
- Source folders: `API Status`
- Source request: `Get API status`

## Implementation Guidance

Diagnostic route only. Do not use for patient/case workflow implementation.

## Request Shape

- Auth type in source: `noauth`
- Path params: `plataform`
- Query params: `none`
- Header names: `none`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
