# POST /web/partners/:partner_id/tests/encounters/:encounter_id/status

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-partners-partner-id-tests-encounters-encounter-id-status-post-encounter-status`
- Surface: `internal`
- Method: `POST`
- Path: `/web/partners/:partner_id/tests/encounters/:encounter_id/status`
- Raw URL template: `{{url}}/web/partners/:partner_id/tests/encounters/:encounter_id/status`
- Source folders: `Internal` / `Web` / `Partners` / `Tests` / `Encounters`
- Source request: `Post Encounter Status`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `encounter_id`, `partner_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
