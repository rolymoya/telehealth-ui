# PUT /web/clinicians/:clinician/medical-assistants/:medicalAssistant

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-put-web-clinicians-clinician-medical-assistants-medicalassistant-attach-medical-assistant`
- Surface: `internal`
- Method: `PUT`
- Path: `/web/clinicians/:clinician/medical-assistants/:medicalAssistant`
- Raw URL template: `{{url}}/web/clinicians/:clinician/medical-assistants/:medicalAssistant`
- Source folders: `Internal` / `Web` / `Clinicians` / `Medical Assistants`
- Source request: `Attach Medical Assistant`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `clinician`, `medicalAssistant`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
