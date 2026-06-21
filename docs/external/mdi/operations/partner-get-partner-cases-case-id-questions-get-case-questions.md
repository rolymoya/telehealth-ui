# GET /partner/cases/:case_id/questions

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-questions-get-case-questions`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/questions`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/questions`
- Source folders: `Partners` / `Cases` / `Questions`
- Source request: `Get case questions`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- prioritized: boolean
- prioritized_reason: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].answer: string
- [].case_question_id: string
- [].description: string
- [].display_in_pdf: boolean
- [].displayed_options: array
- [].displayed_options[]: string
- [].important: boolean
- [].is_critical: boolean
- [].label: string
- [].metadata: string
- [].question: string
- [].type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
