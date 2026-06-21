# GET /web/specialties/:specialty/questionnaires/:questionnaire/questions/:question/rules

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-specialties-specialty-questionnaires-questionnaire-questions-question-rules-get-rules`
- Surface: `internal`
- Method: `GET`
- Path: `/web/specialties/:specialty/questionnaires/:questionnaire/questions/:question/rules`
- Raw URL template: `{{url}}/web/specialties/:specialty/questionnaires/:questionnaire/questions/:question/rules?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Specialties` / `Questionnaires` / `Questions` / `Rules`
- Source request: `Get Rules`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `question`, `questionnaire`, `specialty`
- Query params: `page`, `per_page`, `with_relationships[]`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
