# POST /partner/cases/:case_id/tags/:tag_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-tags-tag-id-attach-tag`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/tags/:tag_id`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/tags/:tag_id`
- Source folders: `Partners` / `Cases` / `Tags`
- Source request: `Attach tag`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `tag_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- notes: string

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
