# POST /web/partners/:partner/questionnaires

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-partners-partner-questionnaires-post-questionnaire`
- Surface: `internal`
- Method: `POST`
- Path: `/web/partners/:partner/questionnaires`
- Raw URL template: `{{url}}/web/partners/:partner/questionnaires`
- Source folders: `Internal` / `Web` / `Partners` / `Questionnaires`
- Source request: `Post Questionnaire`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
