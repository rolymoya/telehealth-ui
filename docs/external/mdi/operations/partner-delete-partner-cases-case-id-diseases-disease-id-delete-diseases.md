# DELETE /partner/cases/:case_id/diseases/:disease_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-delete-partner-cases-case-id-diseases-disease-id-delete-diseases`
- Surface: `partner`
- Method: `DELETE`
- Path: `/partner/cases/:case_id/diseases/:disease_id`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/diseases/:disease_id`
- Source folders: `Partners` / `Cases` / `Diseases`
- Source request: `Delete diseases`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `disease_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].description: string
- [].disease_id: string
- [].icd: string
- [].is_primary: boolean

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
