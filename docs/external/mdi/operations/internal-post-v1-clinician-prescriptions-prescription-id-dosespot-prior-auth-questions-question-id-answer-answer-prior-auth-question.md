# POST /v1/clinician/prescriptions/:prescription_id/dosespot/prior-auth/questions/:question_id/answer

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-clinician-prescriptions-prescription-id-dosespot-prior-auth-questions-question-id-answer-answer-prior-auth-question`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/clinician/prescriptions/:prescription_id/dosespot/prior-auth/questions/:question_id/answer`
- Raw URL template: `{{url}}/v1/clinician/prescriptions/:prescription_id/dosespot/prior-auth/questions/:question_id/answer`
- Source folders: `Internal` / `Clinicians App (V1)` / `Prescriptions` / `Dosespot`
- Source request: `Answer Prior Auth Question`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `prescription_id`, `question_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
