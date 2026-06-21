# POST /partner/cases/:case_id/diseases/:disease_id/primary

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-diseases-disease-id-primary-set-primary-disease`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/diseases/:disease_id/primary`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/diseases/:disease_id/primary`
- Source folders: `Partners` / `Cases` / `Diseases`
- Source request: `Set primary disease`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `case_id`, `disease_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
