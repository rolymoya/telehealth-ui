# POST /partner/tests/encounters/:encounter_id/reassign

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `test-post-partner-tests-encounters-encounter-id-reassign-reassign-clinician-to-encounter`
- Surface: `test`
- Method: `POST`
- Path: `/partner/tests/encounters/:encounter_id/reassign`
- Raw URL template: `{{baseUrl}}/partner/tests/encounters/:encounter_id/reassign`
- Source folders: `Partners` / `Tests` / `Encounters`
- Source request: `Reassign clinician to encounter`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `encounter_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
