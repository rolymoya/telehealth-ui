# GET /v1/partner/linked-pharmacies

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-linked-pharmacies-get-linked-pharmacies`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/linked-pharmacies`
- Raw URL template: `{{url}}/v1/partner/linked-pharmacies?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Partners` / `Pharmacies`
- Source request: `Get Linked Pharmacies`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `page`, `per_page`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].created_at: string
- data[].deleted_at: null
- data[].id: string
- data[].partner_id: string
- data[].pharmacy_id: number
- data[].pharmacy_name: string
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
- meta.links[].url: null
- meta.path: string
- meta.per_page: number
- meta.to: number
- meta.total: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
