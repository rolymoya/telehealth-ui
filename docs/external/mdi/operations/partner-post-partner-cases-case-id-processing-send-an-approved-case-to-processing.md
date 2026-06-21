# POST /partner/cases/:case_id/processing

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-processing-send-an-approved-case-to-processing`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/processing`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/processing`
- Source folders: `Partners` / `Cases` / `Case Status`
- Source request: `Send an Approved Case to Processing`

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

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
