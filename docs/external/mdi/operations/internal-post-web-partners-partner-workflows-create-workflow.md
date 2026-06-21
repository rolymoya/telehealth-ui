# POST /web/partners/:partner/workflows

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-partners-partner-workflows-create-workflow`
- Surface: `internal`
- Method: `POST`
- Path: `/web/partners/:partner/workflows`
- Raw URL template: `{{url}}/web/partners/:partner/workflows?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Partners` / `Workflows`
- Source request: `Create Workflow`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `page`, `per_page`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
