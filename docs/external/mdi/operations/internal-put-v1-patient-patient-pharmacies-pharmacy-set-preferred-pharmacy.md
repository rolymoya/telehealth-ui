# PUT /v1/patient/:patient/pharmacies/:pharmacy

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-put-v1-patient-patient-pharmacies-pharmacy-set-preferred-pharmacy`
- Surface: `internal`
- Method: `PUT`
- Path: `/v1/patient/:patient/pharmacies/:pharmacy`
- Raw URL template: `{{url}}/v1/patient/:patient/pharmacies/:pharmacy`
- Source folders: `Internal` / `Patient App (V1)` / `Patient` / `Pharmacies`
- Source request: `Set Preferred Pharmacy`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient`, `pharmacy`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
