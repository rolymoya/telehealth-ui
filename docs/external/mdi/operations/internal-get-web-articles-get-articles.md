# GET /web/articles

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-articles-get-articles`
- Surface: `internal`
- Method: `GET`
- Path: `/web/articles`
- Raw URL template: `{{url}}/web/articles?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Articles`
- Source request: `Get Articles`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `key`, `page`, `per_page`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
