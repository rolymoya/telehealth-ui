# GET /shopify/partners/patients

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-shopify-partners-patients-get-partner-patients`
- Surface: `internal`
- Method: `GET`
- Path: `/shopify/partners/patients`
- Raw URL template: `{{url}}/shopify/partners/patients?metadata=REDACTED_SCALAR&per_page=REDACTED_SCALAR&environments[]=REDACTED_SCALAR`
- Source folders: `Internal` / `Shopify` / `Partners` / `Patients`
- Source request: `Get Partner Patients`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `environments[]`, `metadata`, `per_page`
- Header names: `Content-Type`, `Signature`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
