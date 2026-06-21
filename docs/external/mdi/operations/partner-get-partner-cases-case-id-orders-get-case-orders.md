# GET /partner/cases/:case_id/orders

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-orders-get-case-orders`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/orders`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/orders`
- Source folders: `Partners` / `Cases` / `Orders`
- Source request: `Get Case Orders`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `case_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].case: object
- [].case.case_assignment: object
- [].case.case_assignment.clinician: object
- [].case.case_assignment.clinician.clinician_id: string
- [].case.case_assignment.clinician.clinician_specialty: string
- [].case.case_assignment.clinician.first_name: string
- [].case.case_assignment.clinician.full_name: string
- [].case.case_assignment.clinician.is_online: boolean
- [].case.case_assignment.clinician.last_name: string
- [].case.case_assignment.clinician.photo: object
- [].case.case_assignment.clinician.photo.url_thumbnail: string
- [].case.case_assignment.clinician_id: string
- [].case.case_assignment.created_at: string
- [].case.case_assignment.reason: string
- [].case.case_id: string
- [].case.case_offerings: array
- [].case.case_offerings[]: object
- [].case.case_offerings[].case_offering_id: string
- [].case.case_offerings[].case_prescription_id: string
- [].case.case_offerings[].is_important: boolean
- [].case.case_offerings[].name: string
- [].case.case_offerings[].order: number
- [].case.case_offerings[].title: string
- [].case.case_prescriptions: array
- [].case.case_services: array
- [].case.case_status: object
- [].case.case_status.created_at: string
- [].case.case_status.name: string
- [].case.case_status.reason: null
- [].case.case_status.updated_at: string
- [].case.case_type: string
- [].case.charged_by: string
- [].case.created_at: string
- [].case.diseases: array
- [].case.is_additional_approval_needed: boolean
- [].case.is_chargeable: boolean
- [].case.is_sync: boolean
- [].case.is_upsell_generated: boolean
- [].case.orders: array
- [].case.orders[]: object
- [].case.orders[].created_at: string
- [].case.orders[].external_id: string
- [].case.orders[].id: string
- [].case.orders[].status: string
- [].case.orders[].updated_at: string
- [].case.partner_id: string
- [].case.patient: object
- [].case.patient.address: object
- [].case.patient.address.address: string
- [].case.patient.address.address2: string
- [].case.patient.address.address_id: string
- [].case.patient.address.city_name: string
- [].case.patient.address.state: object
- [].case.patient.address.state.abbreviation: string
- [].case.patient.address.state.country: object
- [].case.patient.address.state.country.abbreviation: string
- [].case.patient.address.state.country.state_id: string
- [].case.patient.address.state.is_sync: boolean
- [].case.patient.address.state.name: string
- [].case.patient.address.state.state_id: string
- [].case.patient.address.zip_code: string
- [].case.patient.date_of_birth: string
- [].case.patient.email: string
- [].case.patient.first_name: string
- [].case.patient.gender: number
- [].case.patient.gender_label: string
- [].case.patient.last_name: string
- [].case.patient.patient_id: string
- [].case.patient.phone_number: string
- [].case.patient.pregnancy: boolean
- [].case.patient_exam_id: string
- [].case.prioritized: boolean
- [].case.prioritized_at: null
- [].case.prioritized_reason: null
- [].case.programs: array
- [].case.reference_case_id: null
- [].case.service_pdf_exported: boolean
- [].case.tags: array
- [].case.tags[]: object
- [].case.tags[].auto_detach_status: null
- [].case.tags[].color: string
- [].case.tags[].description: null
- [].case.tags[].id: string
- [].case.tags[].key: string
- [].case.tags[].name: string
- [].case.tags[].notes: null
- [].case.tags[].removable_role: string
- [].case.tags[].type: string
- [].offerings: array
- [].offerings[]: object
- [].offerings[].case_offering_id: string
- [].offerings[].clinical_note: string
- [].offerings[].clinician_extra_fee: null
- [].offerings[].created_at: string
- [].offerings[].deleted_at: null
- [].offerings[].directions: string
- [].offerings[].diseases: array
- [].offerings[].external_id: string
- [].offerings[].has_recommendations: boolean
- [].offerings[].id: string
- [].offerings[].image_file_id: null
- [].offerings[].is_additional_approval_needed: boolean
- [].offerings[].is_important: boolean
- [].offerings[].name: string
- [].offerings[].offerable_id: string
- [].offerings[].offerable_type: string
- [].offerings[].offering_cost: null
- [].offerings[].order: number
- [].offerings[].order_date: null
- [].offerings[].order_details: null
- [].offerings[].order_status: string
- [].offerings[].order_updated: null
- [].offerings[].product: object
- [].offerings[].product.allow_substitutions: boolean
- [].offerings[].product.created_at: string
- [].offerings[].product.days_before: number
- [].offerings[].product.days_supply: number
- [].offerings[].product.deleted_at: null
- [].offerings[].product.description: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
