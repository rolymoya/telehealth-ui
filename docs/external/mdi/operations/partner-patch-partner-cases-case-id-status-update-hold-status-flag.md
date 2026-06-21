# PATCH /partner/cases/:case_id/status

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-patch-partner-cases-case-id-status-update-hold-status-flag`
- Surface: `partner`
- Method: `PATCH`
- Path: `/partner/cases/:case_id/status`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/status`
- Source folders: `Partners` / `Cases` / `Case Status`
- Source request: `Update hold status flag`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- hold_status: boolean

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- No generated response fields.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
