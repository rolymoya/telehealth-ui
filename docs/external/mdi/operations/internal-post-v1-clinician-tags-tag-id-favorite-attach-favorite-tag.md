# POST /v1/clinician/tags/:tag_id/favorite

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-clinician-tags-tag-id-favorite-attach-favorite-tag`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/clinician/tags/:tag_id/favorite`
- Raw URL template: `{{url}}/v1/clinician/tags/:tag_id/favorite`
- Source folders: `Internal` / `Clinicians App (V1)` / `Tags` / `Favorite Tags`
- Source request: `Attach favorite tag`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `tag_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
