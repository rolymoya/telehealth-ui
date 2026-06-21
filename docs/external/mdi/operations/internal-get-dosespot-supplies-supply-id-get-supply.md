# GET /dosespot/supplies/:supply_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-dosespot-supplies-supply-id-get-supply`
- Surface: `internal`
- Method: `GET`
- Path: `/dosespot/supplies/:supply_id`
- Raw URL template: `{{url}}/dosespot/supplies/:supply_id`
- Source folders: `Internal` / `Dosespot` / `Supplies`
- Source request: `Get Supply`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `supply_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
