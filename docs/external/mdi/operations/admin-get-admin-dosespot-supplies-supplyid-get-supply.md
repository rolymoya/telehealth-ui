# GET /admin/dosespot/supplies/:supplyId

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `admin-get-admin-dosespot-supplies-supplyid-get-supply`
- Surface: `admin`
- Method: `GET`
- Path: `/admin/dosespot/supplies/:supplyId`
- Raw URL template: `{{url}}/admin/dosespot/supplies/:supplyId`
- Source folders: `Internal` / `Admin` / `Dosespot` / `Supplies`
- Source request: `Get Supply`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `supplyId`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
