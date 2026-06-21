# POST /partner/tests/patients/:patient_id/messages

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `test-post-partner-tests-patients-patient-id-messages-create-message`
- Surface: `test`
- Method: `POST`
- Path: `/partner/tests/patients/:patient_id/messages`
- Raw URL template: `{{baseUrl}}/partner/tests/patients/:patient_id/messages`
- Source folders: `Partners` / `Tests` / `Patients` / `Messages`
- Source request: `Create Message`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
