# GET /v1/patient/patients/:patient/cases/:case_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-patient-patients-patient-cases-case-id-get-patient-case`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/patient/patients/:patient/cases/:case_id`
- Raw URL template: `{{url}}/v1/patient/patients/:patient/cases/:case_id`
- Source folders: `Internal` / `Patient App (V1)` / `Patient` / `Cases`
- Source request: `Get patient case`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `patient`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
