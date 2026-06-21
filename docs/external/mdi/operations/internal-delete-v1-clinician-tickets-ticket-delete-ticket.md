# DELETE /v1/clinician/tickets/:ticket

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-v1-clinician-tickets-ticket-delete-ticket`
- Surface: `internal`
- Method: `DELETE`
- Path: `/v1/clinician/tickets/:ticket`
- Raw URL template: `{{url}}/v1/clinician/tickets/:ticket`
- Source folders: `Internal` / `Clinicians App (V1)` / `Tickets`
- Source request: `Delete Ticket`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `ticket`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
