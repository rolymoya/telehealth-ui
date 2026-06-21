# GET /partner/patients/:patient_id/cases

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-cases-get-patient-cases`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/cases`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/cases`
- Source folders: `Partners` / `Patients`
- Source request: `Get patient cases`

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

- current_page: number
- data: array
- data[]: object
- data[].case_assignment: object
- data[].case_assignment.case_assignment_id: string
- data[].case_assignment.clinician: object
- data[].case_assignment.clinician.bio_details: string
- data[].case_assignment.clinician.clinician_id: string
- data[].case_assignment.clinician.first_name: string
- data[].case_assignment.clinician.full_name: string
- data[].case_assignment.clinician.is_online: boolean
- data[].case_assignment.clinician.last_name: string
- data[].case_assignment.clinician.licenses: array
- data[].case_assignment.clinician.licenses[]: object
- data[].case_assignment.clinician.licenses[].license_id: string
- data[].case_assignment.clinician.licenses[].type: string
- data[].case_assignment.clinician.licenses[].value: string
- data[].case_assignment.clinician.photo: object
- data[].case_assignment.clinician.photo.file_id: string
- data[].case_assignment.clinician.photo.mime_type: string
- data[].case_assignment.clinician.photo.name: string
- data[].case_assignment.clinician.photo.path: string
- data[].case_assignment.clinician.photo.url: string
- data[].case_assignment.clinician.photo.url_thumbnail: null
- data[].case_assignment.clinician.profile_url: string
- data[].case_assignment.clinician.specialty: string
- data[].case_assignment.clinician.suffix: string
- data[].case_assignment.created_at: string
- data[].case_assignment.reason: string
- data[].case_files: array
- data[].case_files[]: object
- data[].case_files[].file_id: string
- data[].case_files[].mime_type: string
- data[].case_files[].name: string
- data[].case_files[].url: string
- data[].case_files[].url_thumbnail: null
- data[].case_id: string
- data[].case_notes: array
- data[].case_notes[]: object
- data[].case_notes[].clinician: object
- data[].case_notes[].clinician.clinician_id: string
- data[].case_notes[].clinician.first_name: string
- data[].case_notes[].clinician.full_name: string
- data[].case_notes[].clinician.last_name: string
- data[].case_notes[].clinician.licenses: array
- data[].case_notes[].clinician.licenses[]: object
- data[].case_notes[].clinician.licenses[].license_id: string
- data[].case_notes[].clinician.licenses[].type: string
- data[].case_notes[].clinician.licenses[].value: string
- data[].case_notes[].created_at: string
- data[].case_notes[].text: string
- data[].case_offerings: array
- data[].case_offerings[]: object
- data[].case_offerings[].case_offering_id: string
- data[].case_offerings[].clinical_note: string
- data[].case_offerings[].created_at: string
- data[].case_offerings[].deleted_at: null
- data[].case_offerings[].directions: string
- data[].case_offerings[].id: string
- data[].case_offerings[].is_additional_approval_needed: boolean
- data[].case_offerings[].is_important: boolean
- data[].case_offerings[].name: string
- data[].case_offerings[].offerable_id: string
- data[].case_offerings[].offerable_type: string
- data[].case_offerings[].order: number
- data[].case_offerings[].order_date: null
- data[].case_offerings[].order_details: null
- data[].case_offerings[].order_status: null
- data[].case_offerings[].order_updated: null
- data[].case_offerings[].product: object
- data[].case_offerings[].product.created_at: string
- data[].case_offerings[].product.days_supply: null
- data[].case_offerings[].product.deleted_at: null
- data[].case_offerings[].product.directions: string
- data[].case_offerings[].product.dispense_unit: string
- data[].case_offerings[].product.dispense_unit_id: number
- data[].case_offerings[].product.dosespot_supply_id: number
- data[].case_offerings[].product.effective_date: null
- data[].case_offerings[].product.force_pharmacy: boolean
- data[].case_offerings[].product.id: string
- data[].case_offerings[].product.is_obsolete: null
- data[].case_offerings[].product.metadata: null
- data[].case_offerings[].product.name: string
- data[].case_offerings[].product.ndc: null
- data[].case_offerings[].product.otc: null
- data[].case_offerings[].product.pharmacy_id: null
- data[].case_offerings[].product.pharmacy_name: null
- data[].case_offerings[].product.pharmacy_notes: string
- data[].case_offerings[].product.quantity: string
- data[].case_offerings[].product.refills: number
- data[].case_offerings[].product.title: string
- data[].case_offerings[].product.upc: null
- data[].case_offerings[].product.updated_at: string
- data[].case_offerings[].product_id: string
- data[].case_offerings[].product_type: string
- data[].case_offerings[].status: string
- data[].case_offerings[].status_details: null
- data[].case_offerings[].thank_you_note: string
- data[].case_offerings[].title: string
- data[].case_offerings[].updated_at: string
- data[].case_questions: array
- data[].case_questions[]: object
- data[].case_questions[].answer: string
- data[].case_questions[].case_question_id: string
- data[].case_questions[].display_in_pdf: boolean
- data[].case_questions[].important: boolean
- data[].case_questions[].is_critical: boolean
- data[].case_questions[].question: string
- data[].case_questions[].type: string
- data[].case_status: object
- data[].case_status.created_at: string
- data[].case_status.name: string
- data[].case_status.reason: null
- data[].case_status.updated_at: string
- data[].case_type: string
- data[].created_at: string
- data[].diseases: array
- data[].diseases[]: object
- data[].diseases[].description: string
- data[].diseases[].disease_id: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
