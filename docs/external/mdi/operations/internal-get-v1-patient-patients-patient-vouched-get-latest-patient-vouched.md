# GET /v1/patient/patients/:patient/vouched

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-patient-patients-patient-vouched-get-latest-patient-vouched`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/patient/patients/:patient/vouched`
- Raw URL template: `{{url}}/v1/patient/patients/:patient/vouched`
- Source folders: `Internal` / `Patient App (V1)` / `Patient`
- Source request: `Get latest patient vouched`

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
