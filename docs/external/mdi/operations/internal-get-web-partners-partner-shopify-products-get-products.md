# GET /web/partners/:partner/shopify/products

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-shopify-products-get-products`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/shopify/products`
- Raw URL template: `{{url}}/web/partners/:partner/shopify/products?per_page=REDACTED_SCALAR&page_info=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Partners` / `Shopify`
- Source request: `Get Products`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `page`, `page_info`, `per_page`
- Header names: `Content-Type`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
