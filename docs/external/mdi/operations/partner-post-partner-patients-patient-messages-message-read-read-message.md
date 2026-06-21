# POST /partner/patients/:patient/messages/:message/read

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-patients-patient-messages-message-read-read-message`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/patients/:patient/messages/:message/read`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient/messages/:message/read`
- Source folders: `Partners` / `Patients` / `Messages`
- Source request: `Read Message`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `message`, `patient`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- channel: string
- created_at: string
- deleted_at: null
- dismissed_at: string
- dismissed_by: object
- dismissed_by.active: boolean
- dismissed_by.address_id: string
- dismissed_by.automatic_sync_message: null
- dismissed_by.bio_details: null
- dismissed_by.case_assignment_availability: boolean
- dismissed_by.created_at: string
- dismissed_by.date_of_birth: string
- dismissed_by.deleted_at: null
- dismissed_by.email: string
- dismissed_by.fax_number: null
- dismissed_by.first_name: string
- dismissed_by.full_name: string
- dismissed_by.id: string
- dismissed_by.is_online: boolean
- dismissed_by.is_out_of_office: boolean
- dismissed_by.last_name: string
- dismissed_by.managed_by_partner: boolean
- dismissed_by.out_of_office_message: null
- dismissed_by.passcode_id: string
- dismissed_by.phone_number: null
- dismissed_by.phone_type: null
- dismissed_by.photo_id: null
- dismissed_by.priority: null
- dismissed_by.profile_url: null
- dismissed_by.signature_id: null
- dismissed_by.specialty: null
- dismissed_by.suffix: null
- dismissed_by.timezone_id: string
- dismissed_by.updated_at: string
- dismissed_by_id: string
- dismissed_by_type: string
- emailed_at: null
- files: array
- files[]: object
- files[].created_at: string
- files[].deleted_at: null
- files[].id: string
- files[].mime_type: string
- files[].name: string
- files[].path: string
- files[].pivot: object
- files[].pivot.created_at: string
- files[].pivot.file_id: string
- files[].pivot.message_id: string
- files[].pivot.updated_at: string
- files[].thumbnail_path: null
- files[].thumbnail_url: null
- files[].updated_at: string
- files[].url: string
- id: string
- patient: object
- patient.abbreviated_name: string
- patient.active: boolean
- patient.address_id: string
- patient.allergies: string
- patient.clinician_id: string
- patient.created_at: string
- patient.current_medications: string
- patient.deleted_at: null
- patient.driver_license_id: null
- patient.email: string
- patient.environment_id: string
- patient.first_name: string
- patient.full_name: string
- patient.gender: number
- patient.height: null
- patient.id: string
- patient.intro_video_file_id: null
- patient.intro_video_id: null
- patient.is_live: boolean
- patient.last_name: string
- patient.metadata: string
- patient.partner_id: string
- patient.phone_number: string
- patient.phone_type: string
- patient.prefix: null
- patient.pregnancy: boolean
- patient.updated_at: string
- patient.weight: null
- patient_id: string
- read_at: string
- readings: array
- readings[]: object
- readings[].created_at: string
- readings[].deleted_at: null
- readings[].id: string
- readings[].message_id: string
- readings[].updated_at: string
- readings[].user_id: string
- readings[].user_type: string
- reference_message: null
- reference_message_id: null
- replied_at: string
- reply_message_id: string
- text: null
- updated_at: string
- user: object
- user.active: boolean
- user.address_id: string
- user.automatic_sync_message: null
- user.bio_details: string
- user.case_assignment_availability: boolean
- user.created_at: string
- user.date_of_birth: string
- user.deleted_at: null
- user.email: string
- user.fax_number: string
- user.first_name: string
- user.full_name: string
- user.id: string
- user.is_online: boolean
- user.is_out_of_office: boolean
- user.last_name: string
- user.managed_by_partner: boolean
- user.out_of_office_message: null

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
