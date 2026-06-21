# GET /web/resources/patients

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-resources-patients-get-patients`
- Surface: `internal`
- Method: `GET`
- Path: `/web/resources/patients`
- Raw URL template: `{{url}}/web/resources/patients?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR&order=REDACTED_SCALAR&string_search=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Resources`
- Source request: `Get Patients`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `order`, `page`, `per_page`, `string_search`
- Header names: `none`
- Body mode: `formdata`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
