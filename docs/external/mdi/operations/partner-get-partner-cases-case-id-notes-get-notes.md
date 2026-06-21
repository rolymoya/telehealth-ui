# GET /partner/cases/:case_id/notes

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-notes-get-notes`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/notes`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/notes`
- Source folders: `Partners` / `Cases` / `Clinical Notes`
- Source request: `Get notes`

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

- []: object
- [].case_id: string
- [].case_note_id: string
- [].clinician: object
- [].clinician.active: boolean
- [].clinician.bio_details: null
- [].clinician.case_assignment_availability: boolean
- [].clinician.clinician_id: string
- [].clinician.date_of_birth: string
- [].clinician.email: string
- [].clinician.fax_number: string
- [].clinician.first_name: string
- [].clinician.full_name: string
- [].clinician.is_online: boolean
- [].clinician.last_name: string
- [].clinician.phone_number: string
- [].clinician.phone_type: string
- [].clinician.photo: object
- [].clinician.photo.created_at: string
- [].clinician.photo.file_id: string
- [].clinician.photo.mime_type: string
- [].clinician.photo.name: string
- [].clinician.photo.path: string
- [].clinician.photo.url: string
- [].clinician.photo.url_thumbnail: string
- [].clinician.profile_url: string
- [].clinician.specialty: string
- [].clinician.suffix: null
- [].created_at: string
- [].model_id: string
- [].model_type: string
- [].text: string
- [].updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
