# GET /partner/cases/:case_id/tags/historical

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-tags-historical-get-historical-case-tags`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/tags/historical`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/tags/historical`
- Source folders: `Partners` / `Cases` / `Tags`
- Source request: `Get Historical Case Tags`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- notes: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].case_id: string
- data[].created_at: string
- data[].deleted_at: null
- data[].event: string
- data[].reason: string
- data[].tag: object
- data[].tag.auto_detach_status: null
- data[].tag.color: string
- data[].tag.created_at: string
- data[].tag.deleted_at: null
- data[].tag.description: string
- data[].tag.id: string
- data[].tag.key: string
- data[].tag.name: string
- data[].tag.notes: null
- data[].tag.removable_role: null
- data[].tag.type: string
- data[].tag.updated_at: string
- data[].tag_id: string
- data[].updated_at: string
- data[].user_id: string
- data[].user_type: string
- links: object
- links.first: string
- links.last: string
- links.next: null
- links.prev: null
- meta: object
- meta.current_page: number
- meta.from: number
- meta.last_page: number
- meta.links: array
- meta.links[]: object
- meta.links[].active: boolean
- meta.links[].label: string
- meta.links[].page: null
- meta.links[].url: null
- meta.path: string
- meta.per_page: number
- meta.to: number
- meta.total: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
