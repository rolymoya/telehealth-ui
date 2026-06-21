# DELETE /partner/tags/:tag

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-delete-partner-tags-tag-delete-tag`
- Surface: `partner`
- Method: `DELETE`
- Path: `/partner/tags/:tag`
- Raw URL template: `{{url}}/partner/tags/:tag`
- Source folders: `Partners` / `Tags`
- Source request: `Delete Tag`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `tag`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Response body omitted because it is absent, non-JSON, or unsuitable for generated docs.

- No generated response fields.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
