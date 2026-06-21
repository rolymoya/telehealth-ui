# GET /web/partners/:partner/encounters

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-encounters-get-encounters`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/encounters`
- Raw URL template: `{{url}}/web/partners/:partner/encounters?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR&sort=REDACTED_SCALAR&order=REDACTED_SCALAR&environments[]=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Partners` / `Encounters`
- Source request: `Get Encounters`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `environments[]`, `id`, `order`, `page`, `per_page`, `sort`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
