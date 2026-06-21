# GET /web/partners/:partner/additional-charges/:additionalCharge

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-additional-charges-additionalcharge-get-additional-charge`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/additional-charges/:additionalCharge`
- Raw URL template: `{{url}}/web/partners/:partner/additional-charges/:additionalCharge`
- Source folders: `Internal` / `Web` / `Partners` / `Additional Charges`
- Source request: `Get Additional Charge`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `additionalCharge`, `partner`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
