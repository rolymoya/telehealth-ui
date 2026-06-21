# GET /web/medical-assistants/:medicalAssistant/clinicians

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-medical-assistants-medicalassistant-clinicians-get-medical-assistant-clinicians`
- Surface: `internal`
- Method: `GET`
- Path: `/web/medical-assistants/:medicalAssistant/clinicians`
- Raw URL template: `{{url}}/web/medical-assistants/:medicalAssistant/clinicians`
- Source folders: `Internal` / `Web` / `Medical Assistant`
- Source request: `Get Medical Assistant Clinicians`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `medicalAssistant`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
