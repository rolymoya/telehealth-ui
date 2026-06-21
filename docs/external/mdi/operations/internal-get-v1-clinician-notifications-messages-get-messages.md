# GET /v1/clinician/notifications/messages

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-notifications-messages-get-messages`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/notifications/messages`
- Raw URL template: `{{url}}/v1/clinician/notifications/messages?status=REDACTED_SCALAR&channel=REDACTED_SCALAR&states[]=REDACTED_SCALAR&assigned_to_me=REDACTED_SCALAR&per_page=REDACTED_SCALAR&order=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Messages`
- Source request: `Get Messages`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `assigned_to_me`, `channel`, `clinicians[]`, `environments[]`, `is_live`, `is_sandbox`, `order`, `page`, `partners[]`, `per_page`, `states[]`, `status`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
