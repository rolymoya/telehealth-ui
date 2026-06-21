# GET /partner/questionnaires/:questionnaire_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-questionnaires-questionnaire-id-get-questionnaire`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/questionnaires/:questionnaire_id`
- Raw URL template: `{{baseUrl}}/partner/questionnaires/:questionnaire_id`
- Source folders: `Partners` / `Questionnaires`
- Source request: `Get questionnaire`

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

- active: boolean
- has_pharmacy: boolean
- intro_description: string
- intro_title: string
- is_height_asked: boolean
- is_show_thanks: boolean
- is_show_welcome: boolean
- is_weight_asked: boolean
- metadata: null
- name: string
- offerings: object
- offerings.force_pharmacy: boolean
- offerings.offering_id: string
- offerings.pharmacy_id: null
- offerings.rule_type: string
- offerings.rules: array
- offerings.rules[]: object
- offerings.rules[].id: string
- offerings.rules[].requirements: array
- offerings.rules[].requirements[]: object
- offerings.rules[].requirements[].based_on: string
- offerings.rules[].requirements[].conditional_answer: null
- offerings.rules[].requirements[].required_answer: string
- offerings.rules[].requirements[].required_question_id: null
- offerings.rules[].requirements[].required_question_title: null
- offerings.rules[].title: string
- offerings.rules[].type: string
- offerings.title: string
- outro_description: string
- outro_title: string
- partner_questionnaire_id: string
- questions: array
- questions[]: object
- questions[].attachments: array
- questions[].default_value: null
- questions[].description: null
- questions[].display_in_pdf: boolean
- questions[].feed_ads: null
- questions[].has_back_button: boolean
- questions[].has_next_button: boolean
- questions[].is_critical: boolean
- questions[].is_important: boolean
- questions[].is_optional: boolean
- questions[].is_visible: boolean
- questions[].label: null
- questions[].options: array
- questions[].order: number
- questions[].partner_questionnaire_question_id: string
- questions[].placeholder: null
- questions[].rule_type: string
- questions[].rules: array
- questions[].title: string
- questions[].type: string
- redirect_title: null
- redirect_url: null
- terms_of_service: null

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
