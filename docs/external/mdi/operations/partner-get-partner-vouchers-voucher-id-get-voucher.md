# GET /partner/vouchers/:voucher_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-vouchers-voucher-id-get-voucher`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/vouchers/:voucher_id`
- Raw URL template: `{{baseUrl}}/partner/vouchers/:voucher_id`
- Source folders: `Partners` / `Vouchers`
- Source request: `Get voucher`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `voucher_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- case_id: null
- environment_id: string
- expired: boolean
- expires_at: string
- metadata: null
- onboarding_url: string
- partner: object
- partner.business_model: string
- partner.customer_support_email: string
- partner.customization: object
- partner.customization.background_color: string
- partner.customization.decoration_image: object
- partner.customization.decoration_image.file_id: string
- partner.customization.decoration_image.mime_type: string
- partner.customization.decoration_image.name: string
- partner.customization.decoration_image.path: string
- partner.customization.decoration_image.url: string
- partner.customization.decoration_image.url_thumbnail: string
- partner.customization.primary_color: string
- partner.customization.secondary_color: string
- partner.enable_av_flow: boolean
- partner.image: object
- partner.image.file_id: string
- partner.image.mime_type: string
- partner.image.name: string
- partner.image.path: string
- partner.image.url: string
- partner.image.url_thumbnail: string
- partner.name: string
- partner.operation_country: object
- partner.operation_country.abbreviation: string
- partner.operation_country.country_id: string
- partner.operation_country.name: string
- partner.partner_id: string
- partner.slack_channel_id: string
- partner_questionnaire_id: string
- partner_voucher_id: string
- payload: object
- payload.diseases: array
- payload.diseases[]: object
- payload.diseases[].disease_id: string
- payload.hold_status: boolean
- payload.offerings: array
- payload.offerings[]: object
- payload.offerings[].offering_id: string
- payload.offerings[].product: object
- payload.offerings[].product.force_pharmacy: boolean
- payload.offerings[].product.pharmacy_id: number
- payload.patient_auth: object
- payload.patient_auth.access_token: string
- payload.patient_auth.expires_in: number
- payload.patient_auth.refresh_token: string
- payload.patient_auth.token_type: string
- payload.patient_id: string
- payload.questionnaire_id: string
- pharmacy_id: null
- pharmacy_name: null

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
