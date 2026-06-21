# POST /v1/patient/patients/:patient/subscriptions/:subscription_id/refill

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-patient-patients-patient-subscriptions-subscription-id-refill-refill-subscription`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/patient/patients/:patient/subscriptions/:subscription_id/refill`
- Raw URL template: `{{url}}/v1/patient/patients/:patient/subscriptions/:subscription_id/refill`
- Source folders: `Internal` / `Patient App (V1)` / `Patient` / `Subscriptions`
- Source request: `Refill Subscription`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient`, `subscription_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
