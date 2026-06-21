# GET /v1/patient/patients/:patient/exams

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-patient-patients-patient-exams-get-patient-exams`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/patient/patients/:patient/exams`
- Raw URL template: `{{url}}/v1/patient/patients/:patient/exams?sort=REDACTED_SCALAR&order=REDACTED_SCALAR`
- Source folders: `Internal` / `Patient App (V1)` / `Patient` / `Exams`
- Source request: `Get patient exams`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient`
- Query params: `order`, `sort`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
