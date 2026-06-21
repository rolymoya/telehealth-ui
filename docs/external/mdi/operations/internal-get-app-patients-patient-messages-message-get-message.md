# GET /app/patients/:patient/messages/:message

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-app-patients-patient-messages-message-get-message`
- Surface: `internal`
- Method: `GET`
- Path: `/app/patients/:patient/messages/:message`
- Raw URL template: `{{url}}/app/patients/:patient/messages/:message`
- Source folders: `Internal` / `App` / `Patients` / `Messages`
- Source request: `Get Message`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `message`, `patient`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
