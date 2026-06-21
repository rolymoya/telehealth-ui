# POST /partner/patients/:patient/messages

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-patients-patient-messages-create-message`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/patients/:patient/messages`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient/messages`
- Source folders: `Partners` / `Patients` / `Messages`
- Source request: `Create Message`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- channel: string
- files: array
- files[]: object
- files[].id: string
- reference_message_id: string
- sender_type: string
- text: string

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- channel: string
- created_at: string
- deleted_at: null
- dismissed_at: null
- dismissed_by_id: null
- dismissed_by_type: null
- emailed_at: string
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
- read_at: null
- readings: array
- reference_message_id: string
- replied_at: null
- reply_message_id: null
- text: string
- updated_at: string
- user: object
- user.active: boolean
- user.address_id: string
- user.automatic_sync_message: null
- user.bio_details: null
- user.case_assignment_availability: boolean
- user.created_at: string
- user.date_of_birth: string
- user.deleted_at: null
- user.email: string
- user.fax_number: null
- user.first_name: string
- user.full_name: string
- user.id: string
- user.is_online: boolean
- user.is_out_of_office: boolean
- user.last_name: string
- user.managed_by_partner: boolean
- user.out_of_office_message: null
- user.passcode_id: string
- user.phone_number: null
- user.phone_type: null
- user.photo_id: null
- user.priority: null
- user.profile_url: null
- user.signature_id: null
- user.specialty: null
- user.suffix: null
- user.timezone_id: string
- user.updated_at: string
- user_id: string
- user_type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
