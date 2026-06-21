# POST /clinician/partners/:partner_id/automations/:automation_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-clinician-partners-partner-id-automations-automation-id-post-execute-automation`
- Surface: `internal`
- Method: `POST`
- Path: `/clinician/partners/:partner_id/automations/:automation_id`
- Raw URL template: `{{baseUrl}}/clinician/partners/:partner_id/automations/:automation_id`
- Source folders: `Internal` / `Clinicians App (V1)` / `Partners` / `Automations`
- Source request: `Post Execute Automation`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `automation_id`, `partner_id`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
