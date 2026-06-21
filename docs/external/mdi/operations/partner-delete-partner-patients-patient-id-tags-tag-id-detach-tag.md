# DELETE /partner/patients/:patient_id/tags/:tag_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-delete-partner-patients-patient-id-tags-tag-id-detach-tag`
- Surface: `partner`
- Method: `DELETE`
- Path: `/partner/patients/:patient_id/tags/:tag_id`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/tags/:tag_id`
- Source folders: `Partners` / `Patients` / `Tags`
- Source request: `Detach tag`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`, `tag_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
