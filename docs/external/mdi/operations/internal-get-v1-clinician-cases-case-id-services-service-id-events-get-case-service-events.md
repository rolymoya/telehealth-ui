# GET /v1/clinician/cases/:case_id/services/:service_id/events

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-cases-case-id-services-service-id-events-get-case-service-events`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/cases/:case_id/services/:service_id/events`
- Raw URL template: `{{url}}/v1/clinician/cases/:case_id/services/:service_id/events?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Cases` / `Services`
- Source request: `Get case service events`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `service_id`
- Query params: `page`, `per_page`
- Header names: `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
