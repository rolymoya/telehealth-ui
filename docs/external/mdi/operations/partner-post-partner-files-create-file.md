# POST /partner/files

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-files-create-file`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/files`
- Raw URL template: `{{baseUrl}}/partner/files`
- Source folders: `Partners` / `Files`
- Source request: `Create file`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `Content`
- Body mode: `formdata`
- Body note: Form-data field names only. Values are intentionally omitted.

- name: text
- file: file
- type: text

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
