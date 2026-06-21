# GET /web/partners/:partner/questionnaires/:questionnaire/questions/:question/options/:option

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-questionnaires-questionnaire-questions-question-options-option-get-option`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/questionnaires/:questionnaire/questions/:question/options/:option`
- Raw URL template: `{{url}}/web/partners/:partner/questionnaires/:questionnaire/questions/:question/options/:option`
- Source folders: `Internal` / `Web` / `Partners` / `Questionnaires` / `Questions` / `Options`
- Source request: `Get Option`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `option`, `partner`, `question`, `questionnaire`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
