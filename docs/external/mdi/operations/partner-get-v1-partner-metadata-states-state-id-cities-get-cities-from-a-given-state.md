# GET /v1/partner/metadata/states/:state_id/cities

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-metadata-states-state-id-cities-get-cities-from-a-given-state`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/metadata/states/:state_id/cities`
- Raw URL template: `{{url}}/v1/partner/metadata/states/:state_id/cities?search=REDACTED_SCALAR`
- Source folders: `Partners` / `Metadata` / `States` / `Cities`
- Source request: `Get cities from a given state`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `state_id`
- Query params: `search`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].city_id: string
- [].name: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
