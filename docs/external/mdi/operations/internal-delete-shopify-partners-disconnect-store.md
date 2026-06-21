# DELETE /shopify/partners

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-shopify-partners-disconnect-store`
- Surface: `internal`
- Method: `DELETE`
- Path: `/shopify/partners`
- Raw URL template: `{{url}}/shopify/partners`
- Source folders: `Internal` / `Shopify` / `Partners`
- Source request: `Disconnect Store`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
