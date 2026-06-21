# GET /v1/patient/:voucher_id/questionnaires/:questionnaire_id/translate

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-patient-voucher-id-questionnaires-questionnaire-id-translate-get-questionnaire-translation`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/patient/:voucher_id/questionnaires/:questionnaire_id/translate`
- Raw URL template: `{{url}}/v1/patient/:voucher_id/questionnaires/:questionnaire_id/translate?target_language=REDACTED_SCALAR`
- Source folders: `Internal` / `Patient App (V1)` / `Voucher` / `Questionnaires`
- Source request: `Get questionnaire translation`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `questionnaire_id`, `voucher_id`
- Query params: `source_language`, `target_language`
- Header names: `Accept`, `Content-Type`, `Origin`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
