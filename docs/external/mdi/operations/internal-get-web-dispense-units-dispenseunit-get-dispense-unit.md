# GET /web/dispense-units/:dispenseUnit

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-dispense-units-dispenseunit-get-dispense-unit`
- Surface: `internal`
- Method: `GET`
- Path: `/web/dispense-units/:dispenseUnit`
- Raw URL template: `{{url}}/web/dispense-units/:dispenseUnit`
- Source folders: `Internal` / `Web` / `Dispense Units`
- Source request: `Get Dispense Unit`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `dispenseUnit`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
