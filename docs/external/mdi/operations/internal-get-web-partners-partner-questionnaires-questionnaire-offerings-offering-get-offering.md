# GET /web/partners/:partner/questionnaires/:questionnaire/offerings/:offering

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-questionnaires-questionnaire-offerings-offering-get-offering`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/questionnaires/:questionnaire/offerings/:offering`
- Raw URL template: `{{url}}/web/partners/:partner/questionnaires/:questionnaire/offerings/:offering`
- Source folders: `Internal` / `Web` / `Partners` / `Questionnaires` / `Offerings`
- Source request: `Get Offering`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `offering`, `partner`, `questionnaire`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
