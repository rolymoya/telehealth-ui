# GET /v1/partner/metadata/states

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-metadata-states-get-all-states`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/metadata/states`
- Raw URL template: `{{url}}/v1/partner/metadata/states`
- Source folders: `Partners` / `Metadata` / `States`
- Source request: `Get all states`

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
- [].abbreviation: string
- [].country: object
- [].country.abbreviation: string
- [].country.country_id: string
- [].country.name: string
- [].is_av_flow: boolean
- [].is_sync: boolean
- [].name: string
- [].state_id: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
