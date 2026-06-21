# GET /partner/cases/:case_id/offerings/pdf

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-offerings-pdf-get-offerings-pdf`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/offerings/pdf`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/offerings/pdf`
- Source folders: `Partners` / `Cases`
- Source request: `Get Offerings PDF`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `export_type`, `is_automatic_only`, `scope`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- file: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
