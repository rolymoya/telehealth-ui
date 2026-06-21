# GET /web/changelogs

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-changelogs-get-changelogs`
- Surface: `internal`
- Method: `GET`
- Path: `/web/changelogs`
- Raw URL template: `{{url}}/web/changelogs?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR&scope=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Changelogs`
- Source request: `Get Changelogs`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `page`, `per_page`, `scope`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
