# POST /partner/cases/:case_id/assigned

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-assigned-set-case-as-assigned`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/assigned`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/assigned`
- Source folders: `Partners` / `Cases` / `Case Status`
- Source request: `Set case as Assigned`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- case_assignment: object
- case_assignment.case_assignment_id: string
- case_assignment.clinician: object
- case_assignment.clinician.clinician_id: string
- case_assignment.clinician.dea: string
- case_assignment.clinician.first_name: string
- case_assignment.clinician.full_name: string
- case_assignment.clinician.is_online: boolean
- case_assignment.clinician.last_name: string
- case_assignment.clinician.npi: string
- case_assignment.clinician.photo: object
- case_assignment.clinician.photo.file_id: string
- case_assignment.clinician.photo.mime_type: string
- case_assignment.clinician.photo.name: string
- case_assignment.clinician.photo.path: string
- case_assignment.clinician.photo.url: string
- case_assignment.clinician.photo.url_thumbnail: null
- case_assignment.clinician.specialty: string
- case_assignment.clinician.suffix: string
- case_assignment.created_at: string
- case_assignment.reason: string
- case_id: string
- case_status: object
- case_status.name: string
- case_status.reason: null
- case_status.updated_at: string
- case_type: string
- created_at: string
- is_additional_approval_needed: boolean
- is_chargeable: boolean
- is_locked: boolean
- is_sync: boolean
- locked_at: null
- metadata: string
- partner: object
- partner.address: object
- partner.address.address: string
- partner.address.address_id: string
- partner.address.city_name: string
- partner.address.state: object
- partner.address.state.abbreviation: string
- partner.address.state.country: object
- partner.address.state.country.abbreviation: string
- partner.address.state.country.country_id: string
- partner.address.state.country.name: string
- partner.address.state.name: string
- partner.address.state.state_id: string
- partner.address.zip_code: string
- partner.customer_support_email: string
- partner.customization: object
- partner.customization.background_color: string
- partner.customization.primary_color: string
- partner.customization.secondary_color: string
- partner.name: string
- partner.operation_country: object
- partner.operation_country.abbreviation: string
- partner.operation_country.country_id: string
- partner.operation_country.name: string
- partner.operations_support_email: string
- partner.partner_id: string
- partner.partner_notes: string
- partner.patient_message_capability: string
- partner.provides_medications: boolean
- partner.support_message_capability: string
- partner.vouched_integration_type: string
- patient: object
- patient.active: boolean
- patient.address: object
- patient.address.address: string
- patient.address.address2: string
- patient.address.address_id: string
- patient.address.city_name: string
- patient.address.state: object
- patient.address.state.abbreviation: string
- patient.address.state.country: object
- patient.address.state.country.abbreviation: string
- patient.address.state.country.country_id: string
- patient.address.state.country.name: string
- patient.address.state.name: string
- patient.address.state.state_id: string
- patient.address.zip_code: string
- patient.allergies: string
- patient.current_medications: string
- patient.date_of_birth: string
- patient.dosespot: object
- patient.dosespot.patient_dosespot_id: string
- patient.dosespot.sync_status: string
- patient.driver_license: object
- patient.driver_license.file_id: string
- patient.driver_license.mime_type: string
- patient.driver_license.name: string
- patient.driver_license.path: string
- patient.driver_license.url: string
- patient.driver_license.url_thumbnail: null
- patient.email: string
- patient.first_name: string
- patient.gender: number
- patient.gender_label: string
- patient.height: number
- patient.is_live: boolean
- patient.last_name: string
- patient.medical_conditions: string
- patient.metadata: string
- patient.middle_name: string
- patient.patient_id: string
- patient.phone_number: string
- patient.phone_type: string
- patient.prefix: string
- patient.pregnancy: boolean
- patient.weight: number
- patient_exam_id: null
- prioritized: boolean
- prioritized_at: null
- prioritized_reason: null
- reference_case_id: string
- tags: array
- tags[]: object
- tags[].auto_detach_status: array
- tags[].auto_detach_status[]: string
- tags[].color: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
