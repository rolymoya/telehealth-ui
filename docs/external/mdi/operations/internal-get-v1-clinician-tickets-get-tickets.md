# GET /v1/clinician/tickets

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-tickets-get-tickets`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/tickets`
- Raw URL template: `{{url}}/v1/clinician/tickets?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Tickets`
- Source request: `Get Tickets`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `page`, `per_page`, `product`, `status`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
