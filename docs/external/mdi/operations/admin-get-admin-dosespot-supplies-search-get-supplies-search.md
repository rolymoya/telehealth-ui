# GET /admin/dosespot/supplies/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `admin-get-admin-dosespot-supplies-search-get-supplies-search`
- Surface: `admin`
- Method: `GET`
- Path: `/admin/dosespot/supplies/search`
- Raw URL template: `{{url}}/admin/dosespot/supplies/search?name=REDACTED_SCALAR&ndc=REDACTED_SCALAR`
- Source folders: `Internal` / `Admin` / `Dosespot` / `Supplies`
- Source request: `Get Supplies (Search)`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `name`, `ndc`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
