# GET /v1/clinician/patients/:patient_id/events

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-patients-patient-id-events-get-patient-events`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/patients/:patient_id/events`
- Raw URL template: `{{url}}/v1/clinician/patients/:patient_id/events?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Patients`
- Source request: `Get patient events`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `page`, `per_page`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
