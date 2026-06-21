# POST /partner/vouchers/:voucher_id/expire

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-vouchers-voucher-id-expire-expire-voucher`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/vouchers/:voucher_id/expire`
- Raw URL template: `{{baseUrl}}/partner/vouchers/:voucher_id/expire`
- Source folders: `Partners` / `Vouchers`
- Source request: `Expire Voucher`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `voucher_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- case_id: null
- created_at: string
- deleted_at: null
- demo: boolean
- environment_id: string
- expires_at: string
- id: string
- is_expired: boolean
- onboarding_url: string
- partner_id: string
- partner_questionnaire_id: string
- payload: object
- payload.environment_id: string
- payload.hold_status: boolean
- payload.questionnaire_id: string
- updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
