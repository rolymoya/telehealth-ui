# GET /web/clinicians/:clinician/medical-assistants

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-clinicians-clinician-medical-assistants-get-medical-assistants`
- Surface: `internal`
- Method: `GET`
- Path: `/web/clinicians/:clinician/medical-assistants`
- Raw URL template: `{{url}}/web/clinicians/:clinician/medical-assistants?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Clinicians` / `Medical Assistants`
- Source request: `Get Medical Assistants`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `clinician`
- Query params: `page`, `per_page`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
