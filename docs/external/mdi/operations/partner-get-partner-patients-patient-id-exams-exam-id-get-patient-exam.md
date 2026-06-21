# GET /partner/patients/:patient_id/exams/:exam_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-exams-exam-id-get-patient-exam`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/exams/:exam_id`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/exams/:exam_id`
- Source folders: `Partners` / `Patients` / `Exams`
- Source request: `Get patient exam`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `exam_id`, `patient_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- allergies: string
- created_at: string
- deleted_at: null
- height: number
- id: string
- medical_conditions: string
- medications: string
- patient_id: string
- updated_at: string
- weight: null

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
