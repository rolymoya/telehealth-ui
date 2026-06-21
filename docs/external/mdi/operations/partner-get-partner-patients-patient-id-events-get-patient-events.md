# GET /partner/patients/:patient_id/events

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-events-get-patient-events`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/events`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/events?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Partners` / `Patients`
- Source request: `Get patient events`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `page`, `per_page`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].by: string
- [].by_model: string
- [].date_time: string
- [].event_id: string
- [].model: string
- [].title: string
- [].type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
