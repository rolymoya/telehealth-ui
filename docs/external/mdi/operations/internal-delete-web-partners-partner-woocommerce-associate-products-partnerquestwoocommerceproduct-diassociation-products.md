# DELETE /web/partners/:partner/woocommerce/associate-products/:partnerQuestWoocommerceProduct

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-web-partners-partner-woocommerce-associate-products-partnerquestwoocommerceproduct-diassociation-products`
- Surface: `internal`
- Method: `DELETE`
- Path: `/web/partners/:partner/woocommerce/associate-products/:partnerQuestWoocommerceProduct`
- Raw URL template: `{{url}}/web/partners/:partner/woocommerce/associate-products/:partnerQuestWoocommerceProduct`
- Source folders: `Internal` / `Web` / `Partners` / `WooCommerce`
- Source request: `Diassociation Products`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`, `partnerQuestWoocommerceProduct`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
