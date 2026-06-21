# GET /web/reviews

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-reviews-get-reviews`
- Surface: `internal`
- Method: `GET`
- Path: `/web/reviews`
- Raw URL template: `{{url}}/web/reviews?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Reviews`
- Source request: `Get Reviews`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `action`, `model_type`, `page`, `per_page`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
