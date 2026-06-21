# POST /web/partners/:partner/review

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-partners-partner-review-review-partner`
- Surface: `internal`
- Method: `POST`
- Path: `/web/partners/:partner/review`
- Raw URL template: `{{url}}/web/partners/:partner/review`
- Source folders: `Internal` / `Web` / `Partners`
- Source request: `Review Partner`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `none`
- Header names: `Version`
- Body mode: `formdata`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
