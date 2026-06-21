# PATCH /web/partners/:partner/questionnaires/:questionnaire/offerings/:offering/rules/:rule/requirements/:requirement

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-partners-partner-questionnaires-questionnaire-offerings-offering-rules-rule-requirements-requirement-patch-requirement`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/partners/:partner/questionnaires/:questionnaire/offerings/:offering/rules/:rule/requirements/:requirement`
- Raw URL template: `{{url}}/web/partners/:partner/questionnaires/:questionnaire/offerings/:offering/rules/:rule/requirements/:requirement`
- Source folders: `Internal` / `Web` / `Partners` / `Questionnaires` / `Offerings` / `Rules` / `Requirements`
- Source request: `Patch Requirement`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `offering`, `partner`, `questionnaire`, `requirement`, `rule`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
