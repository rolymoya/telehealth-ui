# GET /partner/metadata/license-types

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-metadata-license-types-get-all-license-types`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/metadata/license-types`
- Raw URL template: `{{baseUrl}}/partner/metadata/license-types`
- Source folders: `Partners` / `Metadata`
- Source request: `Get all license types`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].description: string
- [].type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
