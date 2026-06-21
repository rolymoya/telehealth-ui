# PATCH /v1/clinician/patients/:patient_id/drivers-license/:file_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-v1-clinician-patients-patient-id-drivers-license-file-id-patch-verified-manually`
- Surface: `internal`
- Method: `PATCH`
- Path: `/v1/clinician/patients/:patient_id/drivers-license/:file_id`
- Raw URL template: `{{url}}/v1/clinician/patients/:patient_id/drivers-license/:file_id`
- Source folders: `Internal` / `Clinicians App (V1)` / `Patients`
- Source request: `Patch Verified Manually`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `file_id`, `patient_id`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
