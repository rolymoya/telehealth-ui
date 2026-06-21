# GET /pharmacies-api/pharmacies/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-pharmacies-api-pharmacies-search-get-pharmacies-search-copy`
- Surface: `internal`
- Method: `GET`
- Path: `/pharmacies-api/pharmacies/search`
- Raw URL template: `{{url}}/pharmacies-api/pharmacies/search?name=REDACTED_SCALAR`
- Source folders: `Internal` / `PharmacyApi` / `Pharmacies`
- Source request: `Get Pharmacies (Search) Copy`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `name`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
