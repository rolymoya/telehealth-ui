# GET /partner/tags

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-tags-get-tags`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/tags`
- Raw URL template: `{{url}}/partner/tags?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR&type=REDACTED_SCALAR`
- Source folders: `Partners` / `Tags`
- Source request: `Get Tags`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `page`, `per_page`, `type`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].auto_detach_status: null
- data[].color: string
- data[].created_at: string
- data[].deleted_at: null
- data[].description: string
- data[].id: string
- data[].key: string
- data[].name: string
- data[].notes: null
- data[].removable_role: null
- data[].type: string
- data[].updated_at: string
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
