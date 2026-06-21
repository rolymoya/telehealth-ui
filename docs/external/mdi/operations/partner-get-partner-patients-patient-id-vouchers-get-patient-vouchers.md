# GET /partner/patients/:patient_id/vouchers

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-vouchers-get-patient-vouchers`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/vouchers`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/vouchers`
- Source folders: `Partners` / `Patients` / `Vouchers`
- Source request: `Get patient vouchers`

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

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].case_id: null
- data[].created_at: string
- data[].deleted_at: null
- data[].demo: boolean
- data[].environment_id: string
- data[].expired: boolean
- data[].expires_at: string
- data[].id: string
- data[].is_expired: boolean
- data[].metadata: string
- data[].onboarding_url: string
- data[].partner_id: string
- data[].partner_questionnaire_id: string
- data[].partner_voucher_id: string
- data[].patient: object
- data[].patient.active: boolean
- data[].patient.address: object
- data[].patient.address.address: string
- data[].patient.address.address2: null
- data[].patient.address.address_id: string
- data[].patient.address.city_name: string
- data[].patient.address.state: object
- data[].patient.address.state.abbreviation: string
- data[].patient.address.state.country: object
- data[].patient.address.state.country.abbreviation: string
- data[].patient.address.state.country.country_id: string
- data[].patient.address.state.country.name: string
- data[].patient.address.state.is_av_flow: boolean
- data[].patient.address.state.is_sync: boolean
- data[].patient.address.state.name: string
- data[].patient.address.state.state_id: string
- data[].patient.address.zip_code: string
- data[].patient.allergies: null
- data[].patient.clinician_id: null
- data[].patient.created_at: string
- data[].patient.current_medications: null
- data[].patient.date_of_birth: string
- data[].patient.dosespot: object
- data[].patient.dosespot.dosespot_id: null
- data[].patient.dosespot.eligibilities: array
- data[].patient.dosespot.metadata: null
- data[].patient.dosespot.sync_status: null
- data[].patient.dosespot.synced_at: null
- data[].patient.driver_license: null
- data[].patient.email: string
- data[].patient.exam_id: null
- data[].patient.first_name: string
- data[].patient.gender: number
- data[].patient.gender_label: string
- data[].patient.height: null
- data[].patient.important_offering_case_id: null
- data[].patient.intro_video: null
- data[].patient.is_live: boolean
- data[].patient.last_name: string
- data[].patient.medical_conditions: null
- data[].patient.metadata: string
- data[].patient.partner: object
- data[].patient.partner.business_model: string
- data[].patient.partner.can_unlock_phi: boolean
- data[].patient.partner.custom_style: null
- data[].patient.partner.custom_theme: null
- data[].patient.partner.customer_support_email: string
- data[].patient.partner.customization: object
- data[].patient.partner.customization.background_color: string
- data[].patient.partner.customization.primary_color: string
- data[].patient.partner.customization.secondary_color: string
- data[].patient.partner.enable_auto_reassignment: boolean
- data[].patient.partner.enable_automatic_sync_flow: boolean
- data[].patient.partner.enable_av_flow: boolean
- data[].patient.partner.enable_icd_bmi: boolean
- data[].patient.partner.force_hold_status: boolean
- data[].patient.partner.is_shopify_active: boolean
- data[].patient.partner.name: string
- data[].patient.partner.operation_country: object
- data[].patient.partner.operation_country.abbreviation: string
- data[].patient.partner.operation_country.country_id: string
- data[].patient.partner.operation_country.name: string
- data[].patient.partner.operations_support_email: string
- data[].patient.partner.partner_id: string
- data[].patient.partner.partner_notes: string
- data[].patient.partner.patient_message_capability: string
- data[].patient.partner.provides_medications: boolean
- data[].patient.partner.shopify_id: string
- data[].patient.partner.shopify_url: string
- data[].patient.partner.slack_channel_id: null
- data[].patient.partner.support_message_capability: string
- data[].patient.partner.text_message_integration_charge: string
- data[].patient.partner.text_message_integration_type: string
- data[].patient.partner.thank_you_note_footer: string
- data[].patient.partner.thank_you_note_header: string
- data[].patient.partner.vouched_integration_charge: string
- data[].patient.partner.vouched_integration_type: string
- data[].patient.partner_id: string
- data[].patient.patient_auth: object
- data[].patient.patient_auth.access_token: string
- data[].patient.patient_auth.expires_in: number
- data[].patient.patient_auth.refresh_token: string
- data[].patient.patient_auth.token_type: string
- data[].patient.patient_id: string
- data[].patient.phone_number: string
- data[].patient.phone_type: string
- data[].patient.prefix: null
- data[].patient.pregnancy: boolean
- data[].patient.recent_encounter_id: null
- data[].patient.ssn: null
- data[].patient.weight: null
- data[].payload: object
- data[].payload.environment_id: string
- data[].payload.hold_status: boolean
- data[].payload.patient_auth: object
- data[].payload.patient_auth.access_token: string
- data[].payload.patient_auth.expires_in: number
- data[].payload.patient_auth.refresh_token: string
- data[].payload.patient_auth.token_type: string
- data[].payload.questionnaire_id: string
- data[].pharmacy_id: null
- data[].pharmacy_name: null
- data[].updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
