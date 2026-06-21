# GET /v1/clinician/patients/:patient_id/vouchers

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-patients-patient-id-vouchers-get-vouchers`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/patients/:patient_id/vouchers`
- Raw URL template: `{{url}}/v1/clinician/patients/:patient_id/vouchers?with_patient_auth=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Patients` / `Vouchers`
- Source request: `Get Vouchers`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `with_patient_auth`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
