# GET /web/partners/:partner/shopify/associate-products

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-shopify-associate-products-associate-products`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/shopify/associate-products`
- Raw URL template: `{{url}}/web/partners/:partner/shopify/associate-products?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR&sort=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR&product_id=REDACTED_SCALAR&variant_id=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Partners` / `Shopify`
- Source request: `Associate Products`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `page`, `per_page`, `product_id`, `sort`, `variant_id`, `with_relationships[]`
- Header names: `Content-Type`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
