# GET /partner/files/:file_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-files-file-id-get-file`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/files/:file_id`
- Raw URL template: `{{baseUrl}}/partner/files/:file_id`
- Source folders: `Partners` / `Files`
- Source request: `Get file`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `file_id`
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
- type: string
- url: string
- url_thumbnail: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
