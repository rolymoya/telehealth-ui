# GET /shopify/partners/vouchers

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-shopify-partners-vouchers-get-partner-vouchers`
- Surface: `internal`
- Method: `GET`
- Path: `/shopify/partners/vouchers`
- Raw URL template: `{{url}}/shopify/partners/vouchers?metadata=REDACTED_SCALAR`
- Source folders: `Internal` / `Shopify` / `Partners` / `Vouchers`
- Source request: `Get Partner Vouchers`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `metadata`
- Header names: `Content-Type`, `Signature`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
