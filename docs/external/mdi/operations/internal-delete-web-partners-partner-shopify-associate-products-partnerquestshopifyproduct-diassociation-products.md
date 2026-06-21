# DELETE /web/partners/:partner/shopify/associate-products/:partnerQuestShopifyProduct

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-web-partners-partner-shopify-associate-products-partnerquestshopifyproduct-diassociation-products`
- Surface: `internal`
- Method: `DELETE`
- Path: `/web/partners/:partner/shopify/associate-products/:partnerQuestShopifyProduct`
- Raw URL template: `{{url}}/web/partners/:partner/shopify/associate-products/:partnerQuestShopifyProduct`
- Source folders: `Internal` / `Web` / `Partners` / `Shopify`
- Source request: `Diassociation Products`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`, `partnerQuestShopifyProduct`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
