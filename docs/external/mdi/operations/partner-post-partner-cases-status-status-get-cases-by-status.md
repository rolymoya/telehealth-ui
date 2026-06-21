# POST /partner/cases/status/:status

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-status-status-get-cases-by-status`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/status/:status`
- Raw URL template: `{{baseUrl}}/partner/cases/status/:status`
- Source folders: `Partners` / `Cases`
- Source request: `Get cases by status`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `status`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- case_type: string
- clinicians: array
- diseases: array
- is_additional_approval_needed: boolean
- is_assigned_to_me: boolean
- is_live: boolean
- is_sandbox: boolean
- is_sync: boolean
- partners: array
- sort: string
- states: array
- tags: array

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].case_assignment: object
- data[].case_assignment.clinician: object
- data[].case_assignment.clinician.clinician_id: string
- data[].case_assignment.clinician.clinician_specialty: string
- data[].case_assignment.clinician.first_name: string
- data[].case_assignment.clinician.full_name: string
- data[].case_assignment.clinician.is_online: boolean
- data[].case_assignment.clinician.last_name: string
- data[].case_assignment.clinician.photo: object
- data[].case_assignment.clinician.photo.url_thumbnail: string
- data[].case_assignment.clinician_id: string
- data[].case_assignment.created_at: string
- data[].case_assignment.reason: string
- data[].case_id: string
- data[].case_offerings: array
- data[].case_offerings[]: object
- data[].case_offerings[].case_offering_id: string
- data[].case_offerings[].case_prescription_id: string
- data[].case_offerings[].is_important: boolean
- data[].case_offerings[].name: string
- data[].case_offerings[].order: number
- data[].case_offerings[].title: string
- data[].case_prescriptions: array
- data[].case_services: array
- data[].case_services[]: object
- data[].case_services[].case_service_id: string
- data[].case_services[].is_important: boolean
- data[].case_services[].order: number
- data[].case_services[].title: string
- data[].case_status: object
- data[].case_status.created_at: string
- data[].case_status.name: string
- data[].case_status.reason: null
- data[].case_status.updated_at: string
- data[].case_type: string
- data[].charged_by: null
- data[].created_at: string
- data[].diseases: array
- data[].diseases[]: object
- data[].diseases[].description: string
- data[].diseases[].icd: string
- data[].diseases[].id: string
- data[].diseases[].is_primary: boolean
- data[].is_additional_approval_needed: boolean
- data[].is_chargeable: boolean
- data[].is_sync: boolean
- data[].is_upsell_generated: boolean
- data[].orders: array
- data[].orders[]: object
- data[].orders[].created_at: string
- data[].orders[].external_id: string
- data[].orders[].id: string
- data[].orders[].status: string
- data[].orders[].updated_at: string
- data[].partner_id: string
- data[].patient: object
- data[].patient.address: object
- data[].patient.address.address: string
- data[].patient.address.address2: string
- data[].patient.address.address_id: string
- data[].patient.address.city_name: string
- data[].patient.address.state: object
- data[].patient.address.state.abbreviation: string
- data[].patient.address.state.country: object
- data[].patient.address.state.country.abbreviation: string
- data[].patient.address.state.country.state_id: string
- data[].patient.address.state.is_sync: boolean
- data[].patient.address.state.name: string
- data[].patient.address.state.state_id: string
- data[].patient.address.zip_code: string
- data[].patient.date_of_birth: string
- data[].patient.email: string
- data[].patient.first_name: string
- data[].patient.gender: string
- data[].patient.gender_label: string
- data[].patient.last_name: string
- data[].patient.patient_id: string
- data[].patient.phone_number: string
- data[].patient.pregnancy: string
- data[].patient_exam_id: null
- data[].prioritized: boolean
- data[].prioritized_at: null
- data[].prioritized_reason: null
- data[].programs: array
- data[].programs[]: string
- data[].reference_case_id: null
- data[].service_pdf_exported: boolean
- data[].tags: array
- data[].tags[]: object
- data[].tags[].auto_detach_status: null
- data[].tags[].color: string
- data[].tags[].description: null
- data[].tags[].id: string
- data[].tags[].key: string
- data[].tags[].name: string
- data[].tags[].notes: null
- data[].tags[].removable_role: string
- data[].tags[].type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
