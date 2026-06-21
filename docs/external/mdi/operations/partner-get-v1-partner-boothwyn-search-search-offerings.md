# GET /v1/partner/boothwyn/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-boothwyn-search-search-offerings`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/boothwyn/search`
- Raw URL template: `{{url}}/v1/partner/boothwyn/search?name=REDACTED_SCALAR`
- Source folders: `Partners` / `Offerings` / `Boothwyn`
- Source request: `Search Offerings`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `name`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].dispensable_drug_id: null
- [].is_obsolete: boolean
- [].name: string
- [].name_with_route_dose_form: string
- [].ndc: string
- [].routed_dose_form_drug_id: null
- [].rx_cui: null
- [].strength: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
