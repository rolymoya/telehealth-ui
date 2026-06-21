# POST /shopify/partners/patients/:patient/data

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-shopify-partners-patients-patient-data-request-patient-data`
- Surface: `internal`
- Method: `POST`
- Path: `/shopify/partners/patients/:patient/data`
- Raw URL template: `{{url}}/shopify/partners/patients/:patient/data`
- Source folders: `Internal` / `Shopify` / `Partners` / `Patients`
- Source request: `Request patient data`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient`
- Query params: `none`
- Header names: `Content-Type`, `Signature`, `Version`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
