# POST /v1/patient/patients/:patient/data

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-patient-patients-patient-data-request-patient-data`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/patient/patients/:patient/data`
- Raw URL template: `{{url}}/v1/patient/patients/:patient/data`
- Source folders: `Internal` / `Patient App (V1)` / `Patient`
- Source request: `Request patient data`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
