# DELETE /app/patients/:patient/messages/:message/unread

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-app-patients-patient-messages-message-unread-unread-message`
- Surface: `internal`
- Method: `DELETE`
- Path: `/app/patients/:patient/messages/:message/unread`
- Raw URL template: `{{url}}/app/patients/:patient/messages/:message/unread`
- Source folders: `Internal` / `App` / `Patients` / `Messages`
- Source request: `Unread Message`

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
