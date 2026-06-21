# GET /web/dispense-units

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-dispense-units-get-dispense-units`
- Surface: `internal`
- Method: `GET`
- Path: `/web/dispense-units`
- Raw URL template: `{{url}}/web/dispense-units?page=REDACTED_SCALAR&order=REDACTED_SCALAR&sort=REDACTED_SCALAR&per_page=REDACTED_SCALAR&active=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Dispense Units`
- Source request: `Get Dispense Units`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `active`, `dosespot_dispense_unit_id`, `name`, `order`, `page`, `per_page`, `sort`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
