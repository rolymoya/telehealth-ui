# POST /partner/tests/vouchers/:voucher_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `test-post-partner-tests-vouchers-voucher-id-create-patient-and-encounter`
- Surface: `test`
- Method: `POST`
- Path: `/partner/tests/vouchers/:voucher_id`
- Raw URL template: `{{baseUrl}}/partner/tests/vouchers/:voucher_id`
- Source folders: `Partners` / `Tests` / `Encounters`
- Source request: `Create Patient and Encounter`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `voucher_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
