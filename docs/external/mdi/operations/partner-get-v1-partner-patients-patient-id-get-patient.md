# GET /v1/partner/patients/:patient_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-patients-patient-id-get-patient`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/patients/:patient_id`
- Raw URL template: `{{url}}/v1/partner/patients/:patient_id`
- Source folders: `Partners` / `Patients`
- Source request: `Get patient`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- active: boolean
- address: object
- address.address: string
- address.address2: string
- address.address_id: string
- address.city_name: string
- address.state: object
- address.state.abbreviation: string
- address.state.country: object
- address.state.country.abbreviation: string
- address.state.country.country_id: string
- address.state.country.name: string
- address.state.is_av_flow: boolean
- address.state.name: string
- address.state.state_id: string
- address.zip_code: string
- allergies: string
- auth_link: string
- blood_pressure: string
- current_medications: string
- date_of_birth: string
- dosespot: object
- dosespot.dosespot_id: number
- dosespot.eligibilities: array
- dosespot.eligibilities[]: object
- dosespot.eligibilities[].patient_eligibility_id: string
- dosespot.metadata: string
- dosespot.sync_status: string
- dosespot.synced_at: string
- driver_license: object
- driver_license.file_id: string
- driver_license.mime_type: string
- driver_license.name: string
- driver_license.path: string
- driver_license.url: string
- driver_license.url_thumbnail: null
- email: string
- first_name: string
- gender: number
- gender_label: string
- height: number
- intro_video: object
- intro_video.created_at: string
- intro_video.file_id: string
- intro_video.mime_type: string
- intro_video.name: string
- intro_video.path: string
- intro_video.url: string
- intro_video.url_thumbnail: null
- is_live: boolean
- last_name: string
- medical_conditions: string
- metadata: string
- middle_name: string
- partner: object
- partner.business_model: string
- partner.customer_support_email: string
- partner.enable_av_flow: boolean
- partner.enable_icd_bmi: boolean
- partner.is_auto_dl_flow: boolean
- partner.name: string
- partner.operation_country: object
- partner.operation_country.abbreviation: string
- partner.operation_country.country_id: string
- partner.operation_country.name: string
- partner.operations_support_email: string
- partner.partner_id: string
- partner.partner_notes: string
- partner.patient_message_capability: string
- partner.slack_channel_id: string
- partner.support_message_capability: string
- partner.vouched_integration_type: string
- partner_id: string
- patient_id: string
- phone_number: string
- phone_type: number
- prefix: string
- pregnancy: boolean
- special_necessities: string
- ssn: string
- weight: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
