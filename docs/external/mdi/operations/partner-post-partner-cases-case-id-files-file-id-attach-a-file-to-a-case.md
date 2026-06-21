# POST /partner/cases/:case_id/files/:file_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-files-file-id-attach-a-file-to-a-case`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/files/:file_id`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/files/:file_id`
- Source folders: `Partners` / `Cases` / `Files`
- Source request: `Attach a file to a case`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `file_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- created_at: string
- file_id: string
- mime_type: string
- name: string
- path: string
- url: string
- url_thumbnail: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
