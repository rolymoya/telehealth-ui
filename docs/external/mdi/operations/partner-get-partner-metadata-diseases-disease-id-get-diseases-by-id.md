# GET /partner/metadata/diseases/:disease_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-metadata-diseases-disease-id-get-diseases-by-id`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/metadata/diseases/:disease_id`
- Raw URL template: `{{baseUrl}}/partner/metadata/diseases/:disease_id`
- Source folders: `Partners` / `Metadata` / `Diseases`
- Source request: `Get diseases by ID`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `disease_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- description: string
- disease_id: string
- icd: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
