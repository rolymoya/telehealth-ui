# PATCH /partner/patients/:patient_id/tags/:tag_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-patch-partner-patients-patient-id-tags-tag-id-update-tag-note`
- Surface: `partner`
- Method: `PATCH`
- Path: `/partner/patients/:patient_id/tags/:tag_id`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/tags/:tag_id`
- Source folders: `Partners` / `Patients` / `Tags`
- Source request: `Update tag note`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`, `tag_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- notes: string

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
