# GET /web/panel-users/:paneUser

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-panel-users-paneuser-get-panel-user`
- Surface: `internal`
- Method: `GET`
- Path: `/web/panel-users/:paneUser`
- Raw URL template: `{{url}}/web/panel-users/:paneUser`
- Source folders: `Internal` / `Web` / `Panel Users`
- Source request: `Get Panel User`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `paneUser`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
