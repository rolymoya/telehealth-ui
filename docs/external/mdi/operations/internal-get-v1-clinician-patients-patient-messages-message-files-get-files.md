# GET /v1/clinician/patients/:patient/messages/:message/files

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-patients-patient-messages-message-files-get-files`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/patients/:patient/messages/:message/files`
- Raw URL template: `{{url}}/v1/clinician/patients/:patient/messages/:message/files?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Patients` / `Messages` / `Files`
- Source request: `Get Files`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `message`, `patient`
- Query params: `page`, `per_page`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
