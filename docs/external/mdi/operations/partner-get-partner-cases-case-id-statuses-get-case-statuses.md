# GET /partner/cases/:case_id/statuses

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-statuses-get-case-statuses`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/statuses`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/statuses`
- Source folders: `Partners` / `Cases` / `Case Status`
- Source request: `Get Case Statuses`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Response body omitted because it is absent, non-JSON, or unsuitable for generated docs.

- No generated response fields.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
