# GET /partner/cases/:case_id/pdf

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-pdf-get-case-services-precriptions-pdf`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/pdf`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/pdf`
- Source folders: `Partners` / `Cases`
- Source request: `Get Case Services/Precriptions PDF`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `case_id`
- Query params: `automatic_only`, `create_as_file`, `is_create_as_base64`, `is_only_prescriptions`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- file: string

### Response 2 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- file: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
