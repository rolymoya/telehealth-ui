# GET /partner/metadata/diseases

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-metadata-diseases-get-all-disease-codes`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/metadata/diseases`
- Raw URL template: `{{baseUrl}}/partner/metadata/diseases`
- Source folders: `Partners` / `Metadata` / `Diseases`
- Source request: `Get all Disease Codes`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `description`, `icd`, `page`, `per_page`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].description: string
- data[].disease_id: string
- data[].icd: string
- links: object
- links.first: string
- links.last: string
- links.next: string
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
