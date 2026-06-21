# GET /partner/clinicians/:clinician_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-clinicians-clinician-id-get-clinician-information`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/clinicians/:clinician_id`
- Raw URL template: `{{baseUrl}}/partner/clinicians/:clinician_id`
- Source folders: `Partners` / `Clinicians`
- Source request: `Get clinician information`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `clinician_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- active: boolean
- automatic_sync_message: null
- automatic_sync_video_file: object
- automatic_sync_video_file.created_at: string
- automatic_sync_video_file.file_id: string
- automatic_sync_video_file.mime_type: string
- automatic_sync_video_file.name: string
- automatic_sync_video_file.path: string
- automatic_sync_video_file.url: string
- automatic_sync_video_file.url_thumbnail: null
- bio_details: string
- case_assignment_availability: boolean
- clinician_id: string
- date_of_birth: string
- email: string
- fax_number: string
- first_name: string
- full_name: string
- is_message_availability: boolean
- is_online: boolean
- is_out_of_office: boolean
- last_name: string
- licenses: array
- licenses[]: object
- licenses[].license_id: string
- licenses[].type: string
- licenses[].value: string
- managed_by_partner: boolean
- out_of_office_message: string
- phone_number: string
- phone_type: string
- photo: object
- photo.created_at: string
- photo.file_id: string
- photo.mime_type: string
- photo.name: string
- photo.path: string
- photo.url: string
- photo.url_thumbnail: null
- practice_areas: array
- practice_areas[]: object
- practice_areas[].clinician_practice_area_id: string
- practice_areas[].expires_at: string
- practice_areas[].is_expired: boolean
- practice_areas[].license_number: string
- practice_areas[].state: object
- practice_areas[].state.abbreviation: string
- practice_areas[].state.country: object
- practice_areas[].state.country.abbreviation: string
- practice_areas[].state.country.country_id: string
- practice_areas[].state.country.name: string
- practice_areas[].state.is_av_flow: boolean
- practice_areas[].state.name: string
- practice_areas[].state.state_id: string
- profile_url: string
- specialty: string
- suffix: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
