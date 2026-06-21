# GET /partner/patients/:patient_id/exams

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-exams-get-patient-exams`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/exams`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/exams`
- Source folders: `Partners` / `Patients` / `Exams`
- Source request: `Get patient exams`

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

- data: array
- data[]: object
- data[].allergies: string
- data[].created_at: string
- data[].deleted_at: null
- data[].height: number
- data[].id: string
- data[].medical_conditions: string
- data[].medications: string
- data[].patient_id: string
- data[].updated_at: string
- data[].weight: number
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
