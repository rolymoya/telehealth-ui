# GET /web/partners/:partner/shopify/:order/analysis

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-shopify-order-analysis-get-order-analysis`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/shopify/:order/analysis`
- Raw URL template: `{{url}}/web/partners/:partner/shopify/:order/analysis?page=REDACTED_SCALAR&perPage=REDACTED_SCALAR&sort=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Partners` / `Shopify`
- Source request: `Get Order Analysis`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `order`, `partner`
- Query params: `page`, `perPage`, `sort`
- Header names: `Content-Type`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
