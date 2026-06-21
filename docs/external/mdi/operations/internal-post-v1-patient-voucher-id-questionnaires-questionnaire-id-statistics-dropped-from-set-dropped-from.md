# POST /v1/patient/:voucher_id/questionnaires/:questionnaire_id/statistics/dropped-from

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-patient-voucher-id-questionnaires-questionnaire-id-statistics-dropped-from-set-dropped-from`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/patient/:voucher_id/questionnaires/:questionnaire_id/statistics/dropped-from`
- Raw URL template: `{{url}}/v1/patient/:voucher_id/questionnaires/:questionnaire_id/statistics/dropped-from`
- Source folders: `Internal` / `Patient App (V1)` / `Voucher` / `Questionnaires` / `Statistics`
- Source request: `Set dropped from`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `questionnaire_id`, `voucher_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
