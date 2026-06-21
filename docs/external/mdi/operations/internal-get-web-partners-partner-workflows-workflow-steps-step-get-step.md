# GET /web/partners/:partner/workflows/:workflow/steps/:step

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-workflows-workflow-steps-step-get-step`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/workflows/:workflow/steps/:step`
- Raw URL template: `{{url}}/web/partners/:partner/workflows/:workflow/steps/:step`
- Source folders: `Internal` / `Web` / `Partners` / `Workflows` / `Steps`
- Source request: `Get Step`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`, `step`, `workflow`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
