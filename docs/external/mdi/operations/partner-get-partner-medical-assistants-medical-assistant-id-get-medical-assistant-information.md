# GET /partner/medical-assistants/:medical_assistant_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-medical-assistants-medical-assistant-id-get-medical-assistant-information`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/medical-assistants/:medical_assistant_id`
- Raw URL template: `{{baseUrl}}/partner/medical-assistants/:medical_assistant_id`
- Source folders: `Partners` / `Medical Assistants`
- Source request: `Get medical assistant information`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `medical_assistant_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- active: boolean
- created_at: string
- deleted_at: null
- email: string
- first_name: string
- full_name: string
- id: string
- is_online: boolean
- last_name: string
- photo: null
- photo_id: null
- roles: array
- roles[]: object
- roles[].created_at: string
- roles[].id: string
- roles[].name: string
- roles[].pivot: object
- roles[].pivot.created_at: null
- roles[].pivot.model_id: string
- roles[].pivot.model_type: null
- roles[].pivot.role_id: string
- roles[].pivot.updated_at: null
- roles[].updated_at: string
- timezone_id: string
- updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
