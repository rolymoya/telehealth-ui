# GET /partner/patients/:patient/messages

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-messages-get-messages`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient/messages`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient/messages?channel=REDACTED_SCALAR`
- Source folders: `Partners` / `Patients` / `Messages`
- Source request: `Get Messages`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient`
- Query params: `channel`, `page`, `per_page`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].channel: string
- data[].created_at: string
- data[].deleted_at: null
- data[].dismissed_at: string
- data[].dismissed_by: null
- data[].dismissed_by_id: null
- data[].dismissed_by_type: null
- data[].emailed_at: null
- data[].files: array
- data[].id: string
- data[].patient_id: string
- data[].read_message_info: null
- data[].readings: array
- data[].reference_message: null
- data[].reference_message_id: null
- data[].replied_at: null
- data[].reply_message_id: null
- data[].text: string
- data[].updated_at: string
- data[].user: object
- data[].user.active: boolean
- data[].user.address_id: string
- data[].user.automatic_sync_message: null
- data[].user.bio_details: string
- data[].user.case_assignment_availability: boolean
- data[].user.created_at: string
- data[].user.date_of_birth: string
- data[].user.deleted_at: null
- data[].user.email: string
- data[].user.fax_number: string
- data[].user.first_name: string
- data[].user.full_name: string
- data[].user.id: string
- data[].user.is_online: boolean
- data[].user.is_out_of_office: boolean
- data[].user.last_name: string
- data[].user.managed_by_partner: boolean
- data[].user.out_of_office_message: null
- data[].user.passcode_id: null
- data[].user.phone_number: string
- data[].user.phone_type: string
- data[].user.photo_id: string
- data[].user.priority: null
- data[].user.profile_url: null
- data[].user.signature_id: string
- data[].user.specialty: string
- data[].user.suffix: string
- data[].user.timezone_id: string
- data[].user.updated_at: string
- data[].user_id: string
- data[].user_type: string
- links: object
- links.first: string
- links.last: string
- links.next: null
- links.prev: null
- meta: object
- meta.current_page: number
- meta.from: number
- meta.last_page: number
- meta.links: array
- meta.links[]: object
- meta.links[].active: boolean
- meta.links[].label: string
- meta.links[].url: null
- meta.path: string
- meta.per_page: number
- meta.to: number
- meta.total: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
