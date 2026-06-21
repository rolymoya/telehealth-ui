# POST /v1/partner/patients/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-v1-partner-patients-search-search-patients`
- Surface: `partner`
- Method: `POST`
- Path: `/v1/partner/patients/search`
- Raw URL template: `{{url}}/v1/partner/patients/search`
- Source folders: `Partners` / `Patients`
- Source request: `Search patients`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- is_sandbox: boolean
- search: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].address: object
- [].address.state: object
- [].address.state.abbreviation: string
- [].address.state.country: object
- [].address.state.country.abbreviation: string
- [].address.state.country.country_id: string
- [].address.state.country.name: string
- [].address.state.name: string
- [].address.state.state_id: string
- [].date_of_birth: string
- [].email: string
- [].first_name: string
- [].gender: number
- [].gender_label: string
- [].intro_video: object
- [].intro_video.created_at: string
- [].intro_video.file_id: string
- [].intro_video.mime_type: string
- [].intro_video.name: string
- [].intro_video.path: string
- [].intro_video.url: string
- [].intro_video.url_thumbnail: null
- [].is_live: boolean
- [].last_name: string
- [].middle_name: string
- [].partner: object
- [].partner.business_model: string
- [].partner.customer_support_email: string
- [].partner.enable_av_flow: boolean
- [].partner.name: string
- [].partner.operation_country: object
- [].partner.operation_country.abbreviation: string
- [].partner.operation_country.country_id: string
- [].partner.operation_country.name: string
- [].partner.operations_support_email: string
- [].partner.partner_id: string
- [].partner.partner_notes: string
- [].partner.patient_message_capability: string
- [].partner.slack_channel_id: string
- [].partner.support_message_capability: string
- [].partner.vouched_integration_type: string
- [].patient_id: string
- [].prefix: string
- [].special_necessities: string
- [].ssn: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
