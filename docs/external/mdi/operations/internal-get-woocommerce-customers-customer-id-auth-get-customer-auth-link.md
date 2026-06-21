# GET /woocommerce/customers/:customer_id/auth

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-woocommerce-customers-customer-id-auth-get-customer-auth-link`
- Surface: `internal`
- Method: `GET`
- Path: `/woocommerce/customers/:customer_id/auth`
- Raw URL template: `{{url}}/woocommerce/customers/:customer_id/auth`
- Source folders: `Internal` / `WooCommerce`
- Source request: `Get Customer Auth Link`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `customer_id`
- Query params: `none`
- Header names: `X-Shopify-Hmac-Sha256`, `X-Shopify-Shop-Domain`, `X-Shopify-Topic`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
