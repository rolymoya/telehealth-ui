# GET /v1/clinician/cases/:case_id/offerings/:offering_id/events

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-cases-case-id-offerings-offering-id-events-get-case-offerings-events`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/cases/:case_id/offerings/:offering_id/events`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/offerings/:offering_id/events?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Offerings`
- Source request: `Get case offerings events`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `offering_id`
- Query params: `page`, `per_page`
- Header names: `Content-Type`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
