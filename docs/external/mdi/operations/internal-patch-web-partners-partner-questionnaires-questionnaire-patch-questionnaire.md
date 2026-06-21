# PATCH /web/partners/:partner/questionnaires/:questionnaire

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-partners-partner-questionnaires-questionnaire-patch-questionnaire`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/partners/:partner/questionnaires/:questionnaire`
- Raw URL template: `{{url}}/web/partners/:partner/questionnaires/:questionnaire`
- Source folders: `Internal` / `Web` / `Partners` / `Questionnaires`
- Source request: `Patch Questionnaire`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`, `questionnaire`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
