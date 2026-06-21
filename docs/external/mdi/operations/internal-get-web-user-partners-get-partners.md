# GET /web/user/partners

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-user-partners-get-partners`
- Surface: `internal`
- Method: `GET`
- Path: `/web/user/partners`
- Raw URL template: `{{url}}/web/user/partners?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR&should_query_children_partners=REDACTED_SCALAR&should_query_recently_active_partners=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `User` / `Partners`
- Source request: `Get Partners`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `id`, `name`, `order`, `page`, `parent_company`, `per_page`, `search`, `should_query_children_partners`, `should_query_recently_active_partners`, `sort`, `status`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
