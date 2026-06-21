# POST /partner/patients/data

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-patients-data-request-patient-data`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/patients/data`
- Raw URL template: `{{baseUrl}}/partner/patients/data`
- Source folders: `Partners` / `Patients` / `Workflows`
- Source request: `Request Patient Data`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- patient_email: string
- patient_id: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- No generated response fields.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
