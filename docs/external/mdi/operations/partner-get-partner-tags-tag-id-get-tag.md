# GET /partner/tags/:tag_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-tags-tag-id-get-tag`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/tags/:tag_id`
- Raw URL template: `{{url}}/partner/tags/:tag_id`
- Source folders: `Partners` / `Tags`
- Source request: `Get Tag`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `tag_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- auto_detach_status: array
- auto_detach_status[]: string
- color: string
- description: string
- key: string
- name: string
- removable_role: string
- type: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- auto_detach_status: null
- color: string
- created_at: string
- deleted_at: null
- description: string
- id: string
- key: string
- name: string
- notes: null
- removable_role: null
- type: string
- updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
