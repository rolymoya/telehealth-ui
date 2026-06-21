# POST /v1/clinician/cases/:case_id/offerings/:offering/diseases/:disease_id/primary

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-clinician-cases-case-id-offerings-offering-diseases-disease-id-primary-set-primary-disease-2`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/clinician/cases/:case_id/offerings/:offering/diseases/:disease_id/primary`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/offerings/:offering/diseases/:disease_id/primary`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Offerings` / `Diseases`
- Source request: `Set primary disease`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `case_id`, `disease_id`, `offering`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
