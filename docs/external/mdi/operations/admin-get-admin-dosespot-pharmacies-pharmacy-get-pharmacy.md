# GET /admin/dosespot/pharmacies/:pharmacy

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `admin-get-admin-dosespot-pharmacies-pharmacy-get-pharmacy`
- Surface: `admin`
- Method: `GET`
- Path: `/admin/dosespot/pharmacies/:pharmacy`
- Raw URL template: `{{url}}/admin/dosespot/pharmacies/:pharmacy`
- Source folders: `Internal` / `Admin` / `Dosespot` / `Pharmacies`
- Source request: `Get Pharmacy`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `pharmacy`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
