# GET /partner/metadata/zipcodes

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-metadata-zipcodes-get-cities-and-states-from-zipcode`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/metadata/zipcodes`
- Raw URL template: `{{baseUrl}}/partner/metadata/zipcodes?search=REDACTED_SCALAR`
- Source folders: `Partners` / `Metadata`
- Source request: `Get Cities and States from Zipcode`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `search`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].city: object
- [].city.city_id: string
- [].city.name: string
- [].city.state: object
- [].city.state.abbreviation: string
- [].city.state.is_av_flow: boolean
- [].city.state.is_sync: boolean
- [].city.state.name: string
- [].zipcode: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
