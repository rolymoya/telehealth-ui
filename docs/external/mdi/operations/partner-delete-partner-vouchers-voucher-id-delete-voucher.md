# DELETE /partner/vouchers/:voucher_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-delete-partner-vouchers-voucher-id-delete-voucher`
- Surface: `partner`
- Method: `DELETE`
- Path: `/partner/vouchers/:voucher_id`
- Raw URL template: `{{baseUrl}}/partner/vouchers/:voucher_id`
- Source folders: `Partners` / `Vouchers`
- Source request: `Delete Voucher`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `voucher_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Response body omitted because it is absent, non-JSON, or unsuitable for generated docs.

- No generated response fields.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
