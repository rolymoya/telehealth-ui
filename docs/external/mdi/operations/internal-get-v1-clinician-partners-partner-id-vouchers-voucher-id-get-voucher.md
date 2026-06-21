# GET /v1/clinician/partners/:partner_id/vouchers/:voucher_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-partners-partner-id-vouchers-voucher-id-get-voucher`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/partners/:partner_id/vouchers/:voucher_id`
- Raw URL template: `{{url}}/v1/clinician/partners/:partner_id/vouchers/:voucher_id`
- Source folders: `Internal` / `Clinicians App (V1)` / `Partners` / `Vouchers`
- Source request: `Get voucher`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `partner_id`, `voucher_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
