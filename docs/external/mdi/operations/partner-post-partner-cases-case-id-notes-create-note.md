# POST /partner/cases/:case_id/notes

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-notes-create-note`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/notes`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/notes`
- Source folders: `Partners` / `Cases` / `Clinical Notes`
- Source request: `Create Note`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- text: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- case_id: string
- case_note_id: string
- created_at: string
- model: object
- model.name: string
- model.partner_id: string
- model_id: string
- model_type: string
- text: string
- updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
