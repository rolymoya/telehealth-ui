# GET /partner/questionnaires/:questionnaire_id/questions

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-questionnaires-questionnaire-id-questions-list-questions`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/questionnaires/:questionnaire_id/questions`
- Raw URL template: `{{baseUrl}}/partner/questionnaires/:questionnaire_id/questions`
- Source folders: `Partners` / `Questionnaires` / `Questions`
- Source request: `List questions`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `questionnaire_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].default_value: null
- [].description: string
- [].display_in_pdf: boolean
- [].feed_ads: boolean
- [].is_critical: boolean
- [].is_important: boolean
- [].is_optional: boolean
- [].is_visible: boolean
- [].label: string
- [].options: array
- [].options[]: object
- [].options[].is_important: boolean
- [].options[].is_show_additional_field: boolean
- [].options[].option: string
- [].order: number
- [].partner_questionnaire_question_id: string
- [].placeholder: string
- [].title: string
- [].type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
