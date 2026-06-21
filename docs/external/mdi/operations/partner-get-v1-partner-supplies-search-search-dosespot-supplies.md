# GET /v1/partner/supplies/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-supplies-search-search-dosespot-supplies`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/supplies/search`
- Raw URL template: `{{url}}/v1/partner/supplies/search?name=REDACTED_SCALAR`
- Source folders: `Partners` / `Offerings` / `Dosespot`
- Source request: `Search Dosespot Supplies`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `name`, `ndc`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw`
- Body note: Body shape unavailable from Postman metadata; raw payload omitted.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].dosespot_supply_id: number
- [].is_obsolete: boolean
- [].name: string
- [].ndc: null
- [].otc: boolean
- [].supply_id: number
- [].upc: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
