# GET /v1/clinician/patients/:patient_id/orders

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-patients-patient-id-orders-get-orders`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/patients/:patient_id/orders`
- Raw URL template: `{{url}}/v1/clinician/patients/:patient_id/orders`
- Source folders: `Internal` / `Clinicians App (V1)` / `Patients`
- Source request: `Get Orders`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
