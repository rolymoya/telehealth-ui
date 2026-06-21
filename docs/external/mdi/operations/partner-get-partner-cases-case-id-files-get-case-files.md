# GET /partner/cases/:case_id/files

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-files-get-case-files`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/files`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/files`
- Source folders: `Partners` / `Cases` / `Files`
- Source request: `Get case files`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw`
- Body note: Body shape unavailable from Postman metadata; raw payload omitted.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].created_at: string
- [].file_id: string
- [].mime_type: string
- [].name: string
- [].path: string
- [].url: string
- [].url_thumbnail: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
