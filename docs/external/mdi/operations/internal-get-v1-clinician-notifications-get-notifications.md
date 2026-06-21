# GET /v1/clinician/notifications

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-notifications-get-notifications`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/notifications`
- Raw URL template: `{{url}}/v1/clinician/notifications?inbox=REDACTED_SCALAR&with_relationships=REDACTED_SCALAR&states[]=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Notifications`
- Source request: `Get Notifications`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `event`, `inbox`, `notified_model_ids[]`, `notified_model_types[]`, `notifier_model_ids[]`, `notifier_model_types[]`, `order`, `page`, `partners[]`, `per_page`, `state_id`, `states[]`, `with_relationships`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
