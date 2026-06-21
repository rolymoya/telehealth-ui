# DELETE /v1/patient/patients/:patient

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-v1-patient-patients-patient-request-patient-data-deletion`
- Surface: `internal`
- Method: `DELETE`
- Path: `/v1/patient/patients/:patient`
- Raw URL template: `{{url}}/v1/patient/patients/:patient`
- Source folders: `Internal` / `Patient App (V1)` / `Patient`
- Source request: `Request patient data deletion`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
