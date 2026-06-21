# GET /web/clinicians

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-clinicians-get-clinicians`
- Surface: `internal`
- Method: `GET`
- Path: `/web/clinicians`
- Raw URL template: `{{url}}/web/clinicians`
- Source folders: `Internal` / `Web` / `Clinicians`
- Source request: `Get Clinicians`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `email`, `environments[]`, `first_name`, `id`, `last_name`, `order`, `search`, `sort`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
